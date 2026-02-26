variable "name_prefix" {
  type = string
}

variable "aws_region" {
  type = string
}

variable "vpc_id" {
  type = string
}

# --- Networking ---

variable "app_subnet_ids" {
  description = "Subnet IDs for ECS tasks (public subnets - no NAT needed)"
  type        = list(string)
}

variable "frontend_security_group_id" {
  type = string
}

variable "api_gateway_security_group_id" {
  type = string
}

variable "ml_service_security_group_id" {
  type = string
}

# --- Container images ---

variable "frontend_image" {
  type = string
}

variable "api_gateway_image" {
  type = string
}

variable "api_migrate_image" {
  type = string
}

variable "ml_service_image" {
  type = string
}

# --- ALB target groups ---

variable "frontend_target_group_arn" {
  type = string
}

variable "api_gateway_target_group_arn" {
  type = string
}

# --- Task sizing ---

variable "frontend_cpu" {
  type = number
}

variable "frontend_memory" {
  type = number
}

variable "frontend_desired_count" {
  type = number
}

variable "api_gateway_cpu" {
  type = number
}

variable "api_gateway_memory" {
  type = number
}

variable "api_gateway_desired_count" {
  type = number
}

variable "ml_service_cpu" {
  type = number
}

variable "ml_service_memory" {
  type = number
}

variable "ml_service_desired_count" {
  type = number
}

# --- Service configuration ---

variable "database_url" {
  type      = string
  sensitive = true
}

variable "rabbitmq_url" {
  type        = string
  description = "Amazon MQ primary AMQPS endpoint (without credentials)"
}

variable "rabbitmq_user" {
  type = string
}

variable "rabbitmq_pass" {
  type      = string
  sensitive = true
}

variable "s3_bucket" {
  type = string
}

variable "s3_region" {
  type = string
}

variable "s3_bucket_arn" {
  type = string
}

variable "alb_dns_name" {
  type = string
}

variable "use_https" {
  type = bool
}
