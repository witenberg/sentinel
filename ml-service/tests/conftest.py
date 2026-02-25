import sys
import os
import pytest
from pathlib import Path
from testcontainers.postgres import PostgresContainer
from testcontainers.rabbitmq import RabbitMqContainer
from sqlalchemy import create_engine, text
from moto import mock_aws
import boto3

# Disable Ryuk (Docker volume cleaner) to avoid blocking 8080 port on Windows
os.environ["TESTCONTAINERS_RYUK_DISABLED"] = "1"

_root = Path(__file__).resolve().parent.parent
if str(_root) not in sys.path:
    sys.path.insert(0, str(_root))

# PostgreSQL container
@pytest.fixture(scope="session")
def postgres_url():
    with PostgresContainer("postgres:15-alpine") as postgres:
        url = postgres.get_connection_url()
        engine = create_engine(url)
        with engine.begin() as conn:
            conn.execute(text("""
                CREATE TABLE "AnalysisJob" (
                    id VARCHAR PRIMARY KEY, 
                    status VARCHAR, 
                    "incidentCount" INT
                );
                CREATE TABLE "Incident" (
                    id VARCHAR PRIMARY KEY, 
                    "jobId" VARCHAR, 
                    "incidentTemplate" VARCHAR, 
                    occurrences INT, 
                    "avgScore" FLOAT, 
                    severity VARCHAR, 
                    "exampleLog" TEXT
                );
            """))
        yield url

# RabbitMQ container
@pytest.fixture(scope="session")
def rabbitmq_url():
    with RabbitMqContainer("rabbitmq:3-management-alpine") as rabbit:
        # Get dynamically assigned external host and port mapped to internal 5672
        host = rabbit.get_container_host_ip()
        port = rabbit.get_exposed_port(5672)
        
        # Default login and password for the official RabbitMQ image is guest:guest
        rabbitmq_url = f"amqp://guest:guest@{host}:{port}/"
        yield rabbitmq_url

# Mock S3 (Moto)
@pytest.fixture
def mock_s3():
    with mock_aws():
        # Create a mock S3 client
        s3 = boto3.client("s3", region_name="us-east-1")
        bucket_name = "sentinel-logs"
        s3.create_bucket(Bucket=bucket_name)
        yield s3, bucket_name