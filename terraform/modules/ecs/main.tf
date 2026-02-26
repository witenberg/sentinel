# =============================================================================
# ECS Cluster
# =============================================================================

resource "aws_ecs_cluster" "main" {
  name = "${var.name_prefix}-cluster"

  setting {
    name  = "containerInsights"
    value = "disabled"
  }

  tags = { Name = "${var.name_prefix}-cluster" }
}

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name = aws_ecs_cluster.main.name

  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    weight            = 1
  }
}

# =============================================================================
# CloudWatch Log Groups
# =============================================================================

resource "aws_cloudwatch_log_group" "frontend" {
  name              = "/ecs/${var.name_prefix}/frontend"
  retention_in_days = 14
  tags              = { Service = "frontend" }
}

resource "aws_cloudwatch_log_group" "api_gateway" {
  name              = "/ecs/${var.name_prefix}/api-gateway"
  retention_in_days = 14
  tags              = { Service = "api-gateway" }
}

resource "aws_cloudwatch_log_group" "ml_service" {
  name              = "/ecs/${var.name_prefix}/ml-service"
  retention_in_days = 14
  tags              = { Service = "ml-service" }
}

resource "aws_cloudwatch_log_group" "api_migrate" {
  name              = "/ecs/${var.name_prefix}/api-migrate"
  retention_in_days = 7
  tags              = { Service = "api-migrate" }
}

# =============================================================================
# Secrets Manager
# =============================================================================

resource "aws_secretsmanager_secret" "database_url" {
  name                    = "${var.name_prefix}/database-url"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "database_url" {
  secret_id     = aws_secretsmanager_secret.database_url.id
  secret_string = var.database_url
}

resource "aws_secretsmanager_secret" "rabbitmq_url" {
  name                    = "${var.name_prefix}/rabbitmq-url"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "rabbitmq_url" {
  secret_id     = aws_secretsmanager_secret.rabbitmq_url.id
  secret_string = local.rabbitmq_connection_url
}

locals {
  rabbitmq_connection_url = replace(
    var.rabbitmq_url,
    "amqps://",
    "amqps://${var.rabbitmq_user}:${var.rabbitmq_pass}@"
  )
  frontend_url = var.use_https ? "https://${var.alb_dns_name}" : "http://${var.alb_dns_name}"
}
