resource "aws_db_subnet_group" "main" {
  name       = "${var.name_prefix}-rds"
  subnet_ids = var.subnet_ids

  tags = { Name = "${var.name_prefix}-rds-subnet-group" }
}

resource "aws_db_parameter_group" "postgres15" {
  name_prefix = "${var.name_prefix}-pg15-"
  family      = "postgres15"
  description = "Custom parameter group for Sentinel PostgreSQL 15"

  parameter {
    name  = "log_min_duration_statement"
    value = "1000"
  }

  lifecycle { create_before_destroy = true }
}

resource "aws_db_instance" "main" {
  identifier = "${var.name_prefix}-postgres"

  engine         = "postgres"
  engine_version = "15"
  instance_class = var.instance_class

  allocated_storage     = var.allocated_storage
  max_allocated_storage = var.allocated_storage
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name  = var.db_name
  username = var.db_username
  password = var.db_password
  port     = 5432

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [var.security_group_id]
  parameter_group_name   = aws_db_parameter_group.postgres15.name

  multi_az            = false
  publicly_accessible = false

  backup_retention_period = 1
  backup_window           = "03:00-04:00"
  maintenance_window      = "sun:04:30-sun:05:30"

  deletion_protection = false
  skip_final_snapshot = true

  performance_insights_enabled = false

  tags = { Name = "${var.name_prefix}-postgres" }
}
