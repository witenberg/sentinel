# Sentinel: ML Service

The asynchronous ML worker for the Sentinel system. It performs **zero-shot anomaly detection** on raw system logs, extracting patterns and reporting incidents.

## Features

- **Structured logging:** Uses **structlog** (no ad-hoc `print()`): log levels, ISO timestamps, JSON output in production and colored console in development. **Correlation ID** from the job payload is bound to the logger context and forwarded in result notifications, so request context can be traced across the distributed system—ml-service is one component of a larger Sentinel pipeline.
- **Resilience & fault tolerance:** Features a custom exponential backoff retry mechanism for transient network failures. Implements "fail-fast" environment validation and actively probes external dependencies (PostgreSQL, MinIO, RabbitMQ) to ensure graceful startup.
- **Memory-safe streaming:** Streams log files directly from S3 (MinIO) into the ML pipeline as a generator, bypassing local disk storage and preventing RAM exhaustion on massive log dumps.
- **Zero-shot contextual learning:** Instantiates Isolation Forest and Drain3 template mining per job. The model learns "normal" behavior strictly in the context of the current log file, requiring no pre-labeled historical data.
- **High-performance data processing:** Utilizes fully vectorized NumPy operations (e.g., convolutions for sliding-window metrics) and SQLAlchemy Bulk Inserts to minimize execution time.
- **Robust asynchronous I/O:** Implements thread-safe RabbitMQ callbacks (`add_callback_threadsafe`) to separate heavy ML processing from the main event loop, preventing heartbeat timeouts.

## ML Pipeline (`anomaly.py`)
- **Input:** Iterable stream of log lines (generator).
- **Features:**
  - **Timestamp extraction:** Robust parsing for multiple formats (Unix epoch, Apache, syslog, ISO, compact).
  - **Severity scoring:** Keyword-based heuristics (FATAL, ERROR, WARN, EXCEPTION, FAIL).
  - **Template mining (Drain3):** Clusters logs into structural templates on the fly.
  - **Vectorized features:** Severity, `log1p(time_delta)`, normalized length, template frequency, and a sliding-window context.
- **Anomaly detection:** Isolation Forest identifies statistical outliers (threshold = mean − 2*std). High-severity lines (>=3.0) are automatically flagged.
- **Output:** Aggregated incidents grouped by template (occurrences, avg_score, severity, example_log), sorted by severity and frequency.

## Worker flow (`worker.py`)
1. **Consume:** Acknowledges jobs from **RabbitMQ** (`jobId`, `fileKey`, `bucket`).
2. **Stream & analyze:** Fetches the S3 object and streams the body directly into `analyze_log()`.
3. **Persist:** Executes bulk inserts for `Incident` rows and updates `AnalysisJob` status in **PostgreSQL**.
4. **Notify & clean:** Publishes a completion event to the RabbitMQ results queue, deletes the processed S3 object, and safely ACKs the original message.


## Tests

- **tests/test_anomaly.py** — unit tests for `extract_timestamp_robust`, `get_severity_score`, and `analyze_log` using synthetic logs with known anomalies at specific line numbers (e.g. 501, 1201, 1501, 1801).
- **tests/test_integration.py** — integration test for worker: full flow (S3 → analysis → PostgreSQL, deletion from S3). **testcontainers**: Postgres (schema `AnalysisJob`/`Incident`) and RabbitMQ; **Moto** — mock S3. Fixture `setup_worker_env` in conftest sets `worker.db_engine`, `worker.s3_client`, `worker.RABBIT_URL` to containers/mock; ML (`analyze_log`) is mocked.

Run: `pytest tests/` (requires Docker for integration tests).

## Running app

```bash
# From ml-service/
pip install -r requirements.txt
python worker.py
```

Set env (or use `.env`): `RABBITMQ_URL`, `RABBITMQ_JOBS_QUEUE`, `RABBITMQ_RESULTS_QUEUE`, `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `DATABASE_URL`. RabbitMQ, PostgreSQL and S3 (MinIO) must be up.
