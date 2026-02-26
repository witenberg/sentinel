# =============================================================================
# ECS Task Execution Role (shared - ECR pull, logs, secrets)
# =============================================================================

resource "aws_iam_role" "ecs_execution" {
  name_prefix = "${var.name_prefix}-ecs-exec-"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_execution_base" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "ecs_execution_secrets" {
  name = "secrets-access"
  role = aws_iam_role.ecs_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = ["secretsmanager:GetSecretValue"]
      Resource = [
        aws_secretsmanager_secret.database_url.arn,
        aws_secretsmanager_secret.rabbitmq_url.arn,
      ]
    }]
  })
}

# =============================================================================
# Task Role: API Gateway (S3)
# =============================================================================

resource "aws_iam_role" "api_gateway_task" {
  name_prefix = "${var.name_prefix}-api-gw-task-"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "api_gateway_s3" {
  name = "s3-access"
  role = aws_iam_role.api_gateway_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket",
      ]
      Resource = [
        var.s3_bucket_arn,
        "${var.s3_bucket_arn}/*",
      ]
    }]
  })
}

# =============================================================================
# Task Role: ML Service (S3)
# =============================================================================

resource "aws_iam_role" "ml_service_task" {
  name_prefix = "${var.name_prefix}-ml-task-"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "ml_service_s3" {
  name = "s3-access"
  role = aws_iam_role.ml_service_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:DeleteObject"]
        Resource = "${var.s3_bucket_arn}/*"
      },
      {
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = var.s3_bucket_arn
      },
    ]
  })
}

# =============================================================================
# Task Role: Frontend (no extra permissions)
# =============================================================================

resource "aws_iam_role" "frontend_task" {
  name_prefix = "${var.name_prefix}-fe-task-"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}
