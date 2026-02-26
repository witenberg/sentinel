import os
import sys
import json
import pika
import boto3
import uuid
import time
from concurrent.futures import ThreadPoolExecutor
from sqlalchemy import create_engine, text
from dotenv import load_dotenv
from anomaly import analyze_log
import structlog

load_dotenv()


# --- Configuration of Structlog ---
is_production = os.getenv("ENVIRONMENT") == "production"

structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer() if is_production else structlog.dev.ConsoleRenderer(colors=True)
    ],
    wrapper_class=structlog.make_filtering_bound_logger(20),
    context_class=dict,
    logger_factory=structlog.PrintLoggerFactory(),
    cache_logger_on_first_use=True,
)

logger = structlog.get_logger()

# Runtime dependencies (initialized at startup, not at import time)
RABBIT_URL = None
JOBS_QUEUE_NAME = None
RESULTS_QUEUE_NAME = None
s3_client = None
db_engine = None

# Thread pool for long-running analysis; ack/notify run on connection thread via add_callback_threadsafe
_analysis_executor = ThreadPoolExecutor(max_workers=1)


# --- Tools for resilience ---

def validate_env():
    """Fail-Fast: Exit if critical environment variables are missing."""
    required_vars = ["RABBITMQ_URL", "DATABASE_URL"]


    if not is_production:
        required_vars.extend(["S3_ENDPOINT", "S3_ACCESS_KEY", "S3_SECRET_KEY"])   # Required for local development

    missing = [var for var in required_vars if not os.getenv(var)]
    
    if missing:
        logger.error("Missing required environment variables", missing=missing)
        sys.exit(1)


def _normalize_database_url(db_url: str | None) -> str:
    """Normalize SQLAlchemy DSN and drop unsupported schema query param."""
    if not db_url:
        raise RuntimeError("Missing DATABASE_URL")
    if db_url.startswith("postgres://"):
        db_url = db_url.replace("postgres://", "postgresql://", 1)
    if "?" in db_url:
        parts = db_url.split("?", 1)
        params = "&".join(p for p in parts[1].split("&") if not p.lower().startswith("schema="))
        db_url = parts[0] + ("?" + params if params else "")
    return db_url


def init_runtime_from_env():
    """Initialize clients and runtime config from environment variables."""
    global RABBIT_URL, JOBS_QUEUE_NAME, RESULTS_QUEUE_NAME, s3_client, db_engine

    RABBIT_URL = os.getenv("RABBITMQ_URL")
    JOBS_QUEUE_NAME = os.getenv("RABBITMQ_JOBS_QUEUE")
    RESULTS_QUEUE_NAME = os.getenv("RABBITMQ_RESULTS_QUEUE")

    boto3_kwargs = {
        "region_name": os.getenv("S3_REGION", "us-east-1")
    }
    
    if not is_production:
        boto3_kwargs.update({
            "endpoint_url": os.getenv("S3_ENDPOINT"),
            "aws_access_key_id": os.getenv("S3_ACCESS_KEY"),
            "aws_secret_access_key": os.getenv("S3_SECRET_KEY"),
        })
    
    s3_client = boto3.client("s3", **boto3_kwargs)

    db_url = _normalize_database_url(os.getenv("DATABASE_URL"))
    # Engine is long-lived; SQLAlchemy uses connection pooling by default.
    db_engine = create_engine(db_url)

def with_retry(func, *args, max_retries=3, base_delay=2, **kwargs):
    """Execute function with exponential backoff on errors."""
    for attempt in range(1, max_retries + 1):
        try:
            return func(*args, **kwargs)
        except Exception as e:
            if attempt == max_retries:
                logger.error("Function failed permanently", func=func.__name__, attempts=max_retries, error=str(e))
                raise
            sleep_time = base_delay * attempt
            logger.warning("Function failed, retrying", func=func.__name__, attempt=attempt, max_retries=max_retries, sleep_time=sleep_time, error=str(e))
            time.sleep(sleep_time)

def wait_for_dependencies():
    """Pause worker startup until all external services are available."""
    if db_engine is None or s3_client is None:
        raise RuntimeError("Runtime is not initialized. Call init_runtime_from_env() first.")

    logger.info("Waiting for dependencies to start...")
    
    # Check PostgreSQL
    def ping_db():
        with db_engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    logger.info("Pinging PostgreSQL")
    with_retry(ping_db, max_retries=5, base_delay=3)

    # Check S3 (MinIO)
    def ping_s3():
        s3_client.list_buckets()
    logger.info("Pinging S3 (MinIO)")
    with_retry(ping_s3, max_retries=5, base_delay=3)
    
    logger.info("All dependencies are up and running!")


def send_result_notification(channel, job_id: str, status: str, incidents: list | None, correlation_id: str = None):
    """Publish job result (COMPLETED/FAILED) to results queue using existing channel (no new connection)."""
    try:
        payload = {
            "jobId": job_id,
            "status": status,
            "incidentCount": len(incidents) if incidents else 0,
            "correlationId": correlation_id,
        }
        message = {
            "pattern": RESULTS_QUEUE_NAME,
            "data": payload,
        }
        channel.basic_publish(
            exchange='',
            routing_key=RESULTS_QUEUE_NAME,
            body=json.dumps(message)
        )
        logger.info("Result notification sent", jobId=job_id, status=status)
    except Exception as e:
        logger.error("Failed to send result notification", error=str(e))


def update_job_status(job_id, status, incidents=None, error=None):
    """Update AnalysisJob status and insert Incident rows when COMPLETED."""
    with db_engine.begin() as conn:
        incident_count = len(incidents) if incidents else 0

        query = text("""
            UPDATE "AnalysisJob"
            SET status = :status,
                "incidentCount" = :count
            WHERE id = :id
        """)
        
        conn.execute(query, {
            "status": status,
            "count": incident_count,
            "id": job_id
        })

        if incidents and status == "COMPLETED":
            incident_query = text("""
                INSERT INTO "Incident" (id, "jobId", "incidentTemplate", occurrences, "avgScore", severity, "exampleLog")
                VALUES (:id, :job_id, :template, :occurrences, :avg_score, :severity, :example_log)
            """)

            incident_params = [{
                "id": str(uuid.uuid4()),
                "job_id": job_id,
                "template": incident["incident_template"],
                "occurrences": incident["occurrences"],
                "avg_score": incident["avg_score"],
                "severity": incident["severity"],
                "example_log": incident["example_log"]
            } for incident in incidents]

            if incident_params:
                conn.execute(incident_query, incident_params)
                logger.info("Bulk saved incidents", incidentCount=len(incidents), jobId=job_id)

            logger.info("Job status updated", jobId=job_id, status=status)


def _run_analysis_task(job_id: str, file_key: str, bucket: str):
    """
    Runs in a worker thread: S3 fetch, analyze_log, DB, S3 delete.
    Returns (job_id, status, incidents) so the consumer thread can send
    the notification on the existing channel (pika channels are not thread-safe).
    """
    try:
        logger.info("Fetching from S3", bucket=bucket, fileKey=file_key)
        obj = with_retry(s3_client.get_object, Bucket=bucket, Key=file_key)
       
        lines_stream = (line.decode("utf-8", errors="replace") for line in obj["Body"].iter_lines())

        logger.info("Starting ML analysis stream")
        incidents = analyze_log(lines_stream)

        logger.info("Persisting incidents", incidentCount=len(incidents))
        with_retry(update_job_status, job_id, "COMPLETED", incidents)

        with_retry(s3_client.delete_object, Bucket=bucket, Key=file_key)
        logger.info("Deleted file from S3", fileKey=file_key)
        return (job_id, "COMPLETED", incidents)
    except Exception as e:
        logger.error("Error in analysis task", error=str(e))
        with_retry(update_job_status, job_id, "FAILED", error=str(e), max_retries=2)
        return (job_id, "FAILED", None)


def process_message(ch, method, properties, body):
    """Consume job: run analysis in thread; ack and notify on connection thread via add_callback_threadsafe."""
    raw = json.loads(body)
    data = raw.get("data", raw)
    job_id = data.get("jobId")
    file_key = data.get("fileKey")
    bucket = data.get("bucket", "sentinel-logs")
    correlation_id = data.get("correlationId")

    structlog.contextvars.clear_contextvars()
    if correlation_id:
        structlog.contextvars.bind_contextvars(correlationId=correlation_id)

    logger.info("Job received", jobId=job_id, fileKey=file_key)

    if not job_id or not file_key:
        logger.error("Rejected: missing jobId or fileKey")
        ch.basic_ack(delivery_tag=method.delivery_tag)
        return

    def finish_message(delivery_tag, j_id, status, incidents, correlation_id):
        if correlation_id:
            structlog.contextvars.bind_contextvars(correlationId=correlation_id)
        send_result_notification(ch, j_id, status, incidents, correlation_id)
        ch.basic_ack(delivery_tag=delivery_tag)
    
    def worker_task():
        if correlation_id:
            structlog.contextvars.bind_contextvars(correlationId=correlation_id)

        j_id, status, incidents = _run_analysis_task(job_id, file_key, bucket)

        ch.connection.add_callback_threadsafe(
            lambda: finish_message(method.delivery_tag, j_id, status, incidents, correlation_id)
        )
    
    _analysis_executor.submit(worker_task)


def start_worker():
    if not RABBIT_URL or not JOBS_QUEUE_NAME or not RESULTS_QUEUE_NAME:
        raise RuntimeError("Runtime is not initialized. Call init_runtime_from_env() first.")

    logger.info("Connecting to RabbitMQ")
    params = pika.URLParameters(RABBIT_URL)

    connection = with_retry(pika.BlockingConnection, params, max_retries=5, base_delay=3)
    channel = connection.channel()

    channel.queue_declare(queue=JOBS_QUEUE_NAME, durable=True)
    channel.queue_declare(queue=RESULTS_QUEUE_NAME, durable=True)  # reuse same channel for publishing
    channel.basic_qos(prefetch_count=1)  # one job at a time

    channel.basic_consume(queue=JOBS_QUEUE_NAME, on_message_callback=process_message)
    logger.info("Waiting for messages. CTRL+C to exit.")
    channel.start_consuming()

if __name__ == "__main__":
    validate_env()
    init_runtime_from_env()
    wait_for_dependencies()
    try:
        start_worker()
    except KeyboardInterrupt:
        logger.info("Interrupted")
    except Exception as e:
        logger.error("Worker crashed", error=str(e))