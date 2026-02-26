# Sentinel – AWS Infrastructure (Terraform)

Cost-optimised Terraform configuration for the distributed log-analysis platform on AWS.
Designed for the Free Tier where possible while following AWS best practices.

## Architecture

```
Internet
   │
   ▼
┌──────────────────────────────────────────────────────────┐
│  ALB (Application Load Balancer) - public subnets        │
│  ┌────────────────┐  ┌─────────────────────────────────┐ │
│  │  /* → Frontend │  │ /api/* + /socket.io/* → API GW  │ │
│  └────────────────┘  └─────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
         │                              │
         ▼                              ▼
┌──────────────────────────────────────────────────────────┐
│  ECS Fargate (FARGATE_SPOT) - public subnets             │
│  ┌──────────┐  ┌─────────────┐  ┌──────────────────┐     │
│  │ Frontend │  │ API Gateway │  │ ML Service       │     │
│  │ (Next.js)│  │ (NestJS)    │  │ (Python worker)  │     │
│  └──────────┘  └──────┬──────┘  └────────┬─────────┘     │
└────────────────────────┼─────────────────┼───────────────┘
                         │ SQS             │ SQS
               ┌─────────┴─────────┐       │
               │  jobs_queue       │◄──────┘
               │  results_queue    │
               └───────────────────┘
┌──────────────────────────────────────────────────────────┐
│  Managed data services                                   │
│  ┌──────────────────┐  ┌──────────────────────────────┐  │
│  │ RDS PostgreSQL   │  │ S3 Bucket (logs)             │  │
│  │ (private subnet) │  │ (via VPC Gateway Endpoint)   │  │
│  └──────────────────┘  └──────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

## Cost Optimisations

| Saving                    | Technique                                        |
|---------------------------|--------------------------------------------------|
| ~$32/mo NAT Gateway       | ECS in public subnets with `assign_public_ip`    |
| ~$30/mo Amazon MQ         | Replaced with SQS (1 M free requests/month)      |
| ~$15/mo ElastiCache Redis | Removed (not critical for single-instance setup)  |
| ~$10/mo Fargate           | FARGATE_SPOT capacity provider (~70 % cheaper)    |
| Various                   | Container Insights disabled, log retention 14 d   |

## AWS Services Mapping

| Component        | AWS Service                    | Notes                            |
|------------------|--------------------------------|----------------------------------|
| PostgreSQL       | RDS PostgreSQL 15              | db.t3.micro (Free Tier)          |
| Message queue    | SQS                            | Free Tier: 1 M requests/month    |
| Object storage   | Amazon S3                      | Via VPC Gateway Endpoint (free)  |
| Containers       | ECS Fargate (FARGATE_SPOT)     | Single instance per service      |
| Load Balancer    | ALB                            | Path-based routing, WebSocket    |
| Container Images | ECR                            | Scan on push, lifecycle policy   |
| Secrets          | Secrets Manager                | DATABASE_URL only                |
| Logs             | CloudWatch Logs                | 14-day retention                 |

## Prerequisites

- AWS CLI configured with appropriate credentials
- Terraform >= 1.5
- Docker (for building and pushing images)

## Quick Start

```bash
# 1. Clean state if migrating from previous architecture
rm -f terraform.tfstate terraform.tfstate.backup

# 2. Initialize
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your values
terraform init

# 3. Review and apply infrastructure
terraform plan -out=tfplan
terraform apply tfplan

# 4. Build & push Docker images (repeat for each service)
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin \
  <account-id>.dkr.ecr.us-east-1.amazonaws.com

# Frontend (build with production API URL)
docker build \
  --build-arg NEXT_PUBLIC_API_URL=http://<ALB_DNS>/api/v1 \
  --build-arg NEXT_PUBLIC_WS_URL=http://<ALB_DNS> \
  -t <ecr-url>/sentinel-production/frontend:latest \
  ./frontend
docker push <ecr-url>/sentinel-production/frontend:latest

# API Gateway
docker build -t <ecr-url>/sentinel-production/api-gateway:latest ./api-gateway
docker push <ecr-url>/sentinel-production/api-gateway:latest

# ML Service
docker build -t <ecr-url>/sentinel-production/ml-service:latest ./ml-service
docker push <ecr-url>/sentinel-production/ml-service:latest

# 5. Run database migration (one-off ECS task)
# The exact command is in Terraform output:
terraform output migration_task_command

# 6. Force new deployment to pick up images
aws ecs update-service --cluster sentinel-production-cluster \
  --service sentinel-production-frontend --force-new-deployment
aws ecs update-service --cluster sentinel-production-cluster \
  --service sentinel-production-api-gateway --force-new-deployment
aws ecs update-service --cluster sentinel-production-cluster \
  --service sentinel-production-ml-service --force-new-deployment
```

## Application Code Changes Required

This architecture uses **SQS** instead of RabbitMQ and removes Redis.
The following env vars are available to ECS tasks:

### API Gateway (NestJS)

| Old env var               | New env var              |
|---------------------------|--------------------------|
| `RABBITMQ_URL`            | `SQS_JOBS_QUEUE_URL`     |
| `RABBITMQ_JOBS_QUEUE`     | `SQS_RESULTS_QUEUE_URL`  |
| `RABBITMQ_RESULTS_QUEUE`  | *(removed)*              |
| `REDIS_URL`               | *(removed)*              |

### ML Service (Python)

| Old env var               | New env var              |
|---------------------------|--------------------------|
| `RABBITMQ_URL`            | `SQS_JOBS_QUEUE_URL`     |
| `RABBITMQ_JOBS_QUEUE`     | `SQS_RESULTS_QUEUE_URL`  |
| `RABBITMQ_RESULTS_QUEUE`  | *(removed)*              |

Both services use IAM task roles for S3 and SQS access (no explicit credentials needed).


