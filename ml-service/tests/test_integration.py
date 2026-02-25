import pytest
from unittest.mock import patch
from sqlalchemy import create_engine, text
import worker 

@pytest.fixture(autouse=True)
def setup_worker_env(postgres_url, rabbitmq_url, mock_s3):
    """
    This is a key fixture. It replaces the global objects in worker.py with dynamically generated ones from the containers.
    """
    s3_client, bucket_name = mock_s3
    
    # Replace the database engine with the one from testcontainers
    worker.db_engine = create_engine(postgres_url)
    # Replace the S3 client with the one from Moto
    worker.s3_client = s3_client
    # Replace the RabbitMQ URL (useful for other tests)
    worker.RABBIT_URL = rabbitmq_url
    
    yield worker.db_engine, s3_client, bucket_name

    # Clean up the database after each test to isolate tests
    with worker.db_engine.begin() as conn:
        conn.execute(text('TRUNCATE TABLE "Incident", "AnalysisJob";'))


@patch("worker.analyze_log") # Mock ML model
def test_run_analysis_task_integration(mock_analyze_log, setup_worker_env):
    """
    Test the full flow:
    1. Get file from S3
    2. Analysis (mocked)
    3. Save to PostgreSQL
    4. Delete from S3
    """
    db_engine, s3_client, bucket_name = setup_worker_env
    
    # --- SET UP TEST ENVIRONMENT ---
    job_id = "test-job-123"
    file_key = "logs/test_log.txt"
    
    # Upload file to mocked S3
    s3_client.put_object(Bucket=bucket_name, Key=file_key, Body=b"error line 1\nerror line 2")
    
    # Create a job in the database (so the worker has something to update)
    with db_engine.begin() as conn:
        conn.execute(text('INSERT INTO "AnalysisJob" (id, status) VALUES (:id, :status)'), {"id": job_id, "status": "PENDING"})

    # Configure the behavior of ML model
    mock_analyze_log.return_value = [
        {
            "incident_template": "Out of memory",
            "occurrences": 5,
            "avg_score": 0.95,
            "severity": "HIGH",
            "example_log": "OOM Error"
        }
    ]

    # --- ACTION ---
    result_job_id, result_status, result_incidents = worker._run_analysis_task(job_id, file_key, bucket_name)

    # --- ASSERTIONS ---
    # Check if the function returned what it should
    assert result_job_id == job_id
    assert result_status == "COMPLETED"
    assert len(result_incidents) == 1

    # Check if the job was updated in the database
    with db_engine.connect() as conn:
        # Check if the job status was updated
        job = conn.execute(text('SELECT status, "incidentCount" FROM "AnalysisJob" WHERE id = :id'), {"id": job_id}).fetchone()
        assert job.status == "COMPLETED"
        assert job.incidentCount == 1

        # Check if the incident was saved
        incident = conn.execute(text('SELECT "incidentTemplate", severity FROM "Incident" WHERE "jobId" = :id'), {"id": job_id}).fetchone()
        assert incident.incidentTemplate == "Out of memory"
        assert incident.severity == "HIGH"

    # Check if the file was deleted from S3
    response = s3_client.list_objects_v2(Bucket=bucket_name)
    assert "Contents" not in response  # Empty bucket means the file was deleted