# -----------------------------------------------------------------------------
# General
# -----------------------------------------------------------------------------

variable "project_name" {
  description = "Project name used for resource naming and tagging"
  type        = string
  default     = "sentinel"
}

variable "environment" {
  description = "Deployment environment (e.g. production, staging)"
  type        = string
  default     = "production"
}

variable "aws_region" {
  description = "AWS region for all resources"
  type        = string
  default     = "us-east-1"
}

# -----------------------------------------------------------------------------
# Networking
# -----------------------------------------------------------------------------

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "List of availability zones (minimum 2 for ALB)"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b"]
}

# -----------------------------------------------------------------------------
# RDS (PostgreSQL) – Free Tier: 750 h/month db.t3.micro, 20 GB storage
# -----------------------------------------------------------------------------

variable "rds_instance_class" {
  description = "RDS instance type (db.t3.micro is Free Tier eligible)"
  type        = string
  default     = "db.t3.micro"
}

variable "rds_allocated_storage" {
  description = "Allocated storage in GB (Free Tier: 20 GB)"
  type        = number
  default     = 20
}

# -----------------------------------------------------------------------------
# ECS task sizing (minimised for cost)
# -----------------------------------------------------------------------------

variable "frontend_cpu" {
  description = "CPU units for frontend task (256 = 0.25 vCPU)"
  type        = number
  default     = 256
}

variable "frontend_memory" {
  description = "Memory in MB for frontend task"
  type        = number
  default     = 512
}

variable "frontend_desired_count" {
  description = "Desired number of frontend tasks"
  type        = number
  default     = 1
}

variable "api_gateway_cpu" {
  description = "CPU units for api-gateway task"
  type        = number
  default     = 256
}

variable "api_gateway_memory" {
  description = "Memory in MB for api-gateway task"
  type        = number
  default     = 512
}

variable "api_gateway_desired_count" {
  description = "Desired number of api-gateway tasks"
  type        = number
  default     = 1
}

variable "ml_service_cpu" {
  description = "CPU units for ml-service task"
  type        = number
  default     = 512
}

variable "ml_service_memory" {
  description = "Memory in MB for ml-service task"
  type        = number
  default     = 1024
}

variable "ml_service_desired_count" {
  description = "Desired number of ml-service worker tasks"
  type        = number
  default     = 1
}

# -----------------------------------------------------------------------------
# Domain & TLS (optional)
# -----------------------------------------------------------------------------

variable "domain_name" {
  description = "Custom domain name (leave empty to use ALB DNS with HTTP only)"
  type        = string
  default     = ""
}

variable "acm_certificate_arn" {
  description = "ACM certificate ARN for HTTPS (required when domain_name is set)"
  type        = string
  default     = ""
}

# -----------------------------------------------------------------------------
# CI/CD (GitHub Actions OIDC)
# -----------------------------------------------------------------------------

variable "github_repository" {
  description = "GitHub repository in 'owner/repo' format (used for OIDC trust policy)"
  type        = string
}
