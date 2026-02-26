# =============================================================================
# Task Definitions
# =============================================================================

resource "aws_ecs_task_definition" "frontend" {
  family                   = "${var.name_prefix}-frontend"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.frontend_cpu
  memory                   = var.frontend_memory
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.frontend_task.arn

  container_definitions = jsonencode([{
    name      = "frontend"
    image     = var.frontend_image
    essential = true

    portMappings = [{
      containerPort = 3000
      protocol      = "tcp"
    }]

    environment = [
      { name = "NODE_ENV", value = "production" },
      { name = "PORT", value = "3000" },
      { name = "HOSTNAME", value = "0.0.0.0" },
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.frontend.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "frontend"
      }
    }
  }])

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }
}

resource "aws_ecs_task_definition" "api_gateway" {
  family                   = "${var.name_prefix}-api-gateway"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.api_gateway_cpu
  memory                   = var.api_gateway_memory
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.api_gateway_task.arn

  container_definitions = jsonencode([{
    name      = "api-gateway"
    image     = var.api_gateway_image
    essential = true

    portMappings = [{
      containerPort = 3001
      protocol      = "tcp"
    }]

    environment = [
      { name = "NODE_ENV", value = "production" },
      { name = "PORT", value = "3001" },
      { name = "FRONTEND_URL", value = local.frontend_url },
      { name = "RABBITMQ_JOBS_QUEUE", value = "jobs_queue" },
      { name = "RABBITMQ_RESULTS_QUEUE", value = "results_queue" },
      { name = "S3_BUCKET", value = var.s3_bucket },
      { name = "S3_REGION", value = var.s3_region },
      { name = "UPLOAD_MAX_FILE_SIZE", value = "100000000" },
    ]

    secrets = [
      { name = "DATABASE_URL", valueFrom = aws_secretsmanager_secret.database_url.arn },
      { name = "RABBITMQ_URL", valueFrom = aws_secretsmanager_secret.rabbitmq_url.arn },
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.api_gateway.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "api-gateway"
      }
    }
  }])

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }
}

resource "aws_ecs_task_definition" "ml_service" {
  family                   = "${var.name_prefix}-ml-service"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.ml_service_cpu
  memory                   = var.ml_service_memory
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ml_service_task.arn

  container_definitions = jsonencode([{
    name      = "ml-service"
    image     = var.ml_service_image
    essential = true

    environment = [
      { name = "ENVIRONMENT", value = "production" },
      { name = "RABBITMQ_JOBS_QUEUE", value = "jobs_queue" },
      { name = "RABBITMQ_RESULTS_QUEUE", value = "results_queue" },
      { name = "S3_BUCKET", value = var.s3_bucket },
      { name = "S3_REGION", value = var.s3_region },
    ]

    secrets = [
      { name = "DATABASE_URL", valueFrom = aws_secretsmanager_secret.database_url.arn },
      { name = "RABBITMQ_URL", valueFrom = aws_secretsmanager_secret.rabbitmq_url.arn },
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.ml_service.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "ml-service"
      }
    }
  }])

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }
}

resource "aws_ecs_task_definition" "api_migrate" {
  family                   = "${var.name_prefix}-api-migrate"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.frontend_task.arn

  container_definitions = jsonencode([{
    name      = "api-migrate"
    image     = var.api_gateway_image
    essential = true
    command   = ["sh", "-c", "npx prisma migrate deploy"]

    secrets = [
      { name = "DATABASE_URL", valueFrom = aws_secretsmanager_secret.database_url.arn },
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.api_migrate.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "migrate"
      }
    }
  }])

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }
}

# =============================================================================
# ECS Services (public subnets + FARGATE_SPOT for cost savings)
# =============================================================================

resource "aws_ecs_service" "frontend" {
  name            = "${var.name_prefix}-frontend"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.frontend.arn
  desired_count   = var.frontend_desired_count

  capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    weight            = 1
  }

  network_configuration {
    subnets          = var.app_subnet_ids
    security_groups  = [var.frontend_security_group_id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = var.frontend_target_group_arn
    container_name   = "frontend"
    container_port   = 3000
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  deployment_maximum_percent         = 200
  deployment_minimum_healthy_percent = 100
  health_check_grace_period_seconds  = 60

  lifecycle {
    ignore_changes = [desired_count, task_definition]
  }
}

resource "aws_ecs_service" "api_gateway" {
  name            = "${var.name_prefix}-api-gateway"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api_gateway.arn
  desired_count   = var.api_gateway_desired_count

  capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    weight            = 1
  }

  network_configuration {
    subnets          = var.app_subnet_ids
    security_groups  = [var.api_gateway_security_group_id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = var.api_gateway_target_group_arn
    container_name   = "api-gateway"
    container_port   = 3001
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  deployment_maximum_percent         = 200
  deployment_minimum_healthy_percent = 100
  health_check_grace_period_seconds  = 90

  lifecycle {
    ignore_changes = [desired_count, task_definition]
  }
}

resource "aws_ecs_service" "ml_service" {
  name            = "${var.name_prefix}-ml-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.ml_service.arn
  desired_count   = var.ml_service_desired_count

  capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    weight            = 1
  }

  network_configuration {
    subnets          = var.app_subnet_ids
    security_groups  = [var.ml_service_security_group_id]
    assign_public_ip = true
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  deployment_maximum_percent         = 200
  deployment_minimum_healthy_percent = 100

  lifecycle {
    ignore_changes = [desired_count, task_definition]
  }
}
