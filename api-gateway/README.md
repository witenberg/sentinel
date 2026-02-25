# Sentinel: API Gateway (Orchestrator)

The API gateway and orchestrator for the Sentinel system. It is the single entry point for clients: HTTP API for upload and history, WebSocket for real-time job updates. It coordinates log uploads, job creation, and dispatches work to the async ML pipeline; when analysis completes, it consumes results and pushes them to connected clients.

## What it does

- **Upload:** Accepts log file uploads (multipart), validates type/size, uploads to S3 (MinIO), creates an `AnalysisJob` in PostgreSQL, and publishes a job message to the RabbitMQ jobs queue. The ML worker (ml-service) consumes from that queue and processes the file asynchronously.
- **History:** Serves job history and job-by-id with incidents from PostgreSQL.
- **Real-time updates:** Subscribes to the RabbitMQ results queue. When the worker finishes a job, the gateway reads the result, loads the updated job (and incidents) from the database, and broadcasts a `job_update` event to all connected WebSocket clients. No polling.

## Architectural decisions

- **Full duplex:** HTTP for request/response (upload, history); WebSocket for server-to-client push so the UI gets job completion and incident data as soon as they are ready.
- **Async pipeline:** Job submission is fire-and-forget over RabbitMQ. The gateway does not wait for analysis; it returns a `jobId` immediately. Completion is delivered out-of-band via the results queue and then over WebSocket.
- **Redis:** (1) Socket.IO uses the Redis adapter so multiple gateway instances can share WebSocket state and broadcast to all clients. (2) Rate limiting (throttler) storage is backed by Redis so limits are consistent across instances.
- **Correlation ID:** Incoming requests get a correlation ID (or use `x-correlation-id`). It is stored in CLS, attached to logs, and sent with the job payload to the worker so the full path can be traced across the gateway and ml-service.

Stack: NestJS, Prisma (PostgreSQL), Socket.IO with Redis adapter, RabbitMQ (producer to jobs queue, consumer on results queue), S3 (MinIO), Redis. REST is under `api/v1`; Swagger is at `/docs` in non-production.

## Tests

- **Unit:** Jest; specs next to source (`*.spec.ts`). Services and controllers are tested with mocks for Prisma, storage, and RabbitMQ client. Run: `npm run test`. Coverage: `npm run test:cov`.
- **E2E:** `test/app.e2e-spec.ts` — HTTP upload and history against the full app with external dependencies mocked (Prisma, S3, RabbitMQ, in-memory throttler). Run: `npm run test:e2e`.

No live Redis/PostgreSQL/RabbitMQ/S3 are required for the current test suite.

## Running the service

**Prerequisites:** S3 (MinIO), Redis, RabbitMQ, and PostgreSQL must be running and reachable. Create the database and run Prisma migrations as needed.

1. **Environment:** Copy `.env.example` to `.env` and set all variables (DB URL, Redis, RabbitMQ, S3 endpoint and credentials, `FRONTEND_URL`, etc.). The app validates required env at startup.

2. **Install and run (from `api-gateway/`):**

```bash
npm install
npm run start:dev
```

- **Production build:** `npm run build` then `npm run start:prod`.
- **Plain start:** `npm run start` (no watch).

Default HTTP port is 3000 (configurable via `PORT`). WebSocket is served on the same server. Swagger is available at `http://localhost:3000/docs` when `NODE_ENV !== 'production'`.
