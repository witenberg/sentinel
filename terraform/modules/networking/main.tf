# =============================================================================
# VPC
# =============================================================================

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = { Name = "${var.name_prefix}-vpc" }
}

# =============================================================================
# Internet Gateway
# =============================================================================

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${var.name_prefix}-igw" }
}

# =============================================================================
# Subnets
# =============================================================================

resource "aws_subnet" "public" {
  count = length(var.availability_zones)

  vpc_id                  = aws_vpc.main.id
  cidr_block              = var.public_subnets[count.index]
  availability_zone       = var.availability_zones[count.index]
  map_public_ip_on_launch = true

  tags = { Name = "${var.name_prefix}-public-${var.availability_zones[count.index]}" }
}

resource "aws_subnet" "private" {
  count = length(var.availability_zones)

  vpc_id            = aws_vpc.main.id
  cidr_block        = var.private_subnets[count.index]
  availability_zone = var.availability_zones[count.index]

  tags = { Name = "${var.name_prefix}-private-${var.availability_zones[count.index]}" }
}

# =============================================================================
# Route Tables
# =============================================================================

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${var.name_prefix}-public-rt" }
}

resource "aws_route" "public_internet" {
  route_table_id         = aws_route_table.public.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.main.id
}

resource "aws_route_table_association" "public" {
  count          = length(aws_subnet.public)
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${var.name_prefix}-private-rt" }
}

resource "aws_route_table_association" "private" {
  count          = length(aws_subnet.private)
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}

# =============================================================================
# S3 Gateway Endpoint (free – avoids NAT charges for S3 traffic)
# =============================================================================

resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.${var.aws_region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = [aws_route_table.public.id]

  tags = { Name = "${var.name_prefix}-s3-endpoint" }
}

# =============================================================================
# Security Groups
# =============================================================================

# --- ALB ---
resource "aws_security_group" "alb" {
  name_prefix = "${var.name_prefix}-alb-"
  vpc_id      = aws_vpc.main.id
  description = "ALB - HTTP/HTTPS from the internet"

  tags = { Name = "${var.name_prefix}-alb-sg" }
  lifecycle { create_before_destroy = true }
}

resource "aws_vpc_security_group_ingress_rule" "alb_http" {
  security_group_id = aws_security_group.alb.id
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = 80
  to_port           = 80
  ip_protocol       = "tcp"
}

resource "aws_vpc_security_group_ingress_rule" "alb_https" {
  security_group_id = aws_security_group.alb.id
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = 443
  to_port           = 443
  ip_protocol       = "tcp"
}

resource "aws_vpc_security_group_egress_rule" "alb_all" {
  security_group_id = aws_security_group.alb.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

# --- Frontend ---
resource "aws_security_group" "frontend" {
  name_prefix = "${var.name_prefix}-frontend-"
  vpc_id      = aws_vpc.main.id
  description = "Frontend ECS tasks"

  tags = { Name = "${var.name_prefix}-frontend-sg" }
  lifecycle { create_before_destroy = true }
}

resource "aws_vpc_security_group_ingress_rule" "frontend_from_alb" {
  security_group_id            = aws_security_group.frontend.id
  referenced_security_group_id = aws_security_group.alb.id
  from_port                    = 3000
  to_port                      = 3000
  ip_protocol                  = "tcp"
}

resource "aws_vpc_security_group_egress_rule" "frontend_all" {
  security_group_id = aws_security_group.frontend.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

# --- API Gateway ---
resource "aws_security_group" "api_gateway" {
  name_prefix = "${var.name_prefix}-api-gw-"
  vpc_id      = aws_vpc.main.id
  description = "API Gateway ECS tasks"

  tags = { Name = "${var.name_prefix}-api-gw-sg" }
  lifecycle { create_before_destroy = true }
}

resource "aws_vpc_security_group_ingress_rule" "api_gw_from_alb" {
  security_group_id            = aws_security_group.api_gateway.id
  referenced_security_group_id = aws_security_group.alb.id
  from_port                    = 3001
  to_port                      = 3001
  ip_protocol                  = "tcp"
}

resource "aws_vpc_security_group_egress_rule" "api_gw_all" {
  security_group_id = aws_security_group.api_gateway.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

# --- ML Service ---
resource "aws_security_group" "ml_service" {
  name_prefix = "${var.name_prefix}-ml-svc-"
  vpc_id      = aws_vpc.main.id
  description = "ML Service ECS tasks (worker - outbound only)"

  tags = { Name = "${var.name_prefix}-ml-svc-sg" }
  lifecycle { create_before_destroy = true }
}

resource "aws_vpc_security_group_egress_rule" "ml_svc_all" {
  security_group_id = aws_security_group.ml_service.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

# --- RDS ---
resource "aws_security_group" "rds" {
  name_prefix = "${var.name_prefix}-rds-"
  vpc_id      = aws_vpc.main.id
  description = "RDS PostgreSQL"

  tags = { Name = "${var.name_prefix}-rds-sg" }
  lifecycle { create_before_destroy = true }
}

resource "aws_vpc_security_group_ingress_rule" "rds_from_api_gw" {
  security_group_id            = aws_security_group.rds.id
  referenced_security_group_id = aws_security_group.api_gateway.id
  from_port                    = 5432
  to_port                      = 5432
  ip_protocol                  = "tcp"
}

resource "aws_vpc_security_group_ingress_rule" "rds_from_ml_svc" {
  security_group_id            = aws_security_group.rds.id
  referenced_security_group_id = aws_security_group.ml_service.id
  from_port                    = 5432
  to_port                      = 5432
  ip_protocol                  = "tcp"
}

# --- Amazon MQ (RabbitMQ) ---
resource "aws_security_group" "mq" {
  name_prefix = "${var.name_prefix}-mq-"
  vpc_id      = aws_vpc.main.id
  description = "Amazon MQ RabbitMQ"

  tags = { Name = "${var.name_prefix}-mq-sg" }
  lifecycle { create_before_destroy = true }
}

resource "aws_vpc_security_group_ingress_rule" "mq_from_api_gw" {
  security_group_id            = aws_security_group.mq.id
  referenced_security_group_id = aws_security_group.api_gateway.id
  from_port                    = 5671
  to_port                      = 5671
  ip_protocol                  = "tcp"
}

resource "aws_vpc_security_group_ingress_rule" "mq_from_ml_svc" {
  security_group_id            = aws_security_group.mq.id
  referenced_security_group_id = aws_security_group.ml_service.id
  from_port                    = 5671
  to_port                      = 5671
  ip_protocol                  = "tcp"
}
