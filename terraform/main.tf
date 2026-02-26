data "aws_caller_identity" "current" {}

resource "random_password" "db_password" {
  length  = 32
  special = false
}

resource "random_password" "mq_password" {
  length  = 24
  special = false
}

# =============================================================================
# Networking (VPC, subnets, security groups - no NAT Gateway)
# =============================================================================

module "networking" {
  source = "./modules/networking"

  name_prefix        = local.name_prefix
  vpc_cidr           = var.vpc_cidr
  aws_region         = var.aws_region
  availability_zones = local.azs
  public_subnets     = local.public_subnets
  private_subnets    = local.private_subnets
}

# =============================================================================
# ECR Repositories
# =============================================================================

module "ecr" {
  source = "./modules/ecr"

  name_prefix = local.name_prefix
}

# =============================================================================
# S3 Bucket (log file storage)
# =============================================================================

module "s3" {
  source = "./modules/s3"

  name_prefix = local.name_prefix
  bucket_name = "${local.name_prefix}-data-${data.aws_caller_identity.current.account_id}"
}

# =============================================================================
# RDS PostgreSQL (db.t3.micro - Free Tier eligible)
# =============================================================================

module "rds" {
  source = "./modules/rds"

  name_prefix       = local.name_prefix
  subnet_ids        = module.networking.private_subnet_ids
  security_group_id = module.networking.rds_security_group_id
  instance_class    = var.rds_instance_class
  allocated_storage = var.rds_allocated_storage
  db_name           = "sentinel_db"
  db_username       = "sentinel"
  db_password       = random_password.db_password.result
}

# =============================================================================
# Amazon MQ (RabbitMQ) - SINGLE_INSTANCE mq.t3.micro
# =============================================================================

resource "aws_mq_broker" "rabbitmq" {
  broker_name = "${local.name_prefix}-rabbitmq"

  engine_type        = "RabbitMQ"
  engine_version     = "3.13"
  host_instance_type = "mq.t3.micro"
  deployment_mode    = "SINGLE_INSTANCE"

  subnet_ids      = [module.networking.private_subnet_ids[0]]
  security_groups = [module.networking.mq_security_group_id]

  user {
    username = "sentinel"
    password = random_password.mq_password.result
  }

  publicly_accessible        = false
  auto_minor_version_upgrade = true

  logs {
    general = true
  }

  maintenance_window_start_time {
    day_of_week = "SUNDAY"
    time_of_day = "04:00"
    time_zone   = "UTC"
  }

  tags = { Name = "${local.name_prefix}-rabbitmq" }
}

# =============================================================================
# Application Load Balancer
# =============================================================================

module "alb" {
  source = "./modules/alb"

  name_prefix         = local.name_prefix
  vpc_id              = module.networking.vpc_id
  public_subnet_ids   = module.networking.public_subnet_ids
  security_group_id   = module.networking.alb_security_group_id
  acm_certificate_arn = var.acm_certificate_arn
}

# =============================================================================
# ECS Cluster & Services (FARGATE_SPOT for cost savings)
# =============================================================================

module "ecs" {
  source = "./modules/ecs"

  name_prefix = local.name_prefix
  aws_region  = var.aws_region
  vpc_id      = module.networking.vpc_id

  app_subnet_ids                = module.networking.public_subnet_ids
  frontend_security_group_id    = module.networking.frontend_security_group_id
  api_gateway_security_group_id = module.networking.api_gateway_security_group_id
  ml_service_security_group_id  = module.networking.ml_service_security_group_id

  frontend_image    = "${module.ecr.frontend_repository_url}:latest"
  api_gateway_image = "${module.ecr.api_gateway_repository_url}:latest"
  api_migrate_image = "${module.ecr.api_gateway_repository_url}:migrator-latest"
  ml_service_image  = "${module.ecr.ml_service_repository_url}:latest"

  frontend_target_group_arn    = module.alb.frontend_target_group_arn
  api_gateway_target_group_arn = module.alb.api_gateway_target_group_arn

  frontend_cpu           = var.frontend_cpu
  frontend_memory        = var.frontend_memory
  frontend_desired_count = var.frontend_desired_count

  api_gateway_cpu           = var.api_gateway_cpu
  api_gateway_memory        = var.api_gateway_memory
  api_gateway_desired_count = var.api_gateway_desired_count

  ml_service_cpu           = var.ml_service_cpu
  ml_service_memory        = var.ml_service_memory
  ml_service_desired_count = var.ml_service_desired_count

  database_url = "postgresql://sentinel:${random_password.db_password.result}@${module.rds.endpoint}/sentinel_db?schema=public"

  rabbitmq_url  = aws_mq_broker.rabbitmq.instances[0].endpoints[0]
  rabbitmq_user = "sentinel"
  rabbitmq_pass = random_password.mq_password.result

  s3_bucket     = module.s3.bucket_name
  s3_region     = var.aws_region
  s3_bucket_arn = module.s3.bucket_arn

  alb_dns_name = module.alb.dns_name
  use_https    = local.use_https
}
