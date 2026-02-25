# Sentinel

Sentinel is a distributed log-analysis platform built around an **event-driven, asynchronous pipeline**.
It ingests raw log files, runs ML anomaly detection in the background, persists incidents, and pushes results to the UI in real time.

## System at a glance

- **Three apps, one flow:** `frontend` -> `api-gateway` -> `ml-service`
- **Event-driven orchestration:** RabbitMQ decouples request handling from ML processing
- **Async processing:** upload requests return immediately with a job ID; analysis runs out-of-band
- **Full-duplex communication model:** HTTP for commands/queries + WebSocket for live job updates
- **End-to-end traceability:** correlation ID is propagated across services for request lifecycle tracking
- **Operational resilience:** queue-based decoupling and retry-friendly design reduce blast radius of transient failures
- **Stateless service design:** API and worker instances can scale horizontally behind shared infra

## Components

- `frontend` - lightweight UI for uploading logs, tracking job status, and viewing detected incidents
- `api-gateway` - system entry point and orchestrator; exposes REST API, manages jobs, bridges events to WebSocket clients
- `ml-service` - asynchronous worker; processes each uploaded log file independently using Drain3 + Isolation Forest

## End-to-end flow

1. User uploads a log file from the UI.
2. Gateway stores the file (S3-compatible storage), creates a job record, and publishes a processing event.
3. ML worker consumes the event and analyzes that single file in isolation.
4. Worker stores incident results and emits a completion event.
5. Gateway consumes completion, enriches response data, and pushes a real-time update to connected clients.

## Runtime architecture

- **Transport:** REST + WebSocket (Socket.IO)
- **Messaging backbone:** RabbitMQ (jobs/results queues)
- **Persistence:** PostgreSQL (jobs and incidents)
- **Object storage:** MinIO/S3 (uploaded log files)
- **Distributed coordination:** Redis (shared gateway runtime concerns)


## Run demo

```bash
docker compose -f docker-compose.demo.yml up --build
```

## Addresses

- App: `http://localhost:3000`
- API Gateway: `http://localhost:3001/api/v1`
- RabbitMQ UI: `http://localhost:15672` (`guest` / `guest`)
- MinIO Console: `http://localhost:9001` (`minioadmin` / `minioadmin`)

## Stop demo

```bash
docker compose -f docker-compose.demo.yml down
```
