output "app_url" {
  description = "Application URL (frontend)"
  value       = local.app_url
}

output "alb_dns_name" {
  description = "ALB DNS name"
  value       = module.alb.dns_name
}

output "ecr_repositories" {
  description = "ECR repository URLs for the CI/CD pipeline"
  value = {
    frontend    = module.ecr.frontend_repository_url
    api_gateway = module.ecr.api_gateway_repository_url
    ml_service  = module.ecr.ml_service_repository_url
  }
}

output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = module.ecs.cluster_name
}

output "rds_endpoint" {
  description = "RDS PostgreSQL endpoint"
  value       = module.rds.endpoint
  sensitive   = true
}

output "vpc_id" {
  description = "VPC ID"
  value       = module.networking.vpc_id
}

output "migration_task_command" {
  description = "AWS CLI command to run the database migration task"
  value       = module.ecs.migration_run_command
}

output "github_actions_role_arn" {
  description = "IAM role ARN for GitHub Actions OIDC - set as GitHub Actions variable AWS_ROLE_ARN"
  value       = aws_iam_role.github_actions.arn
}
