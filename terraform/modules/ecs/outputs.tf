output "cluster_name" {
  value = aws_ecs_cluster.main.name
}

output "cluster_id" {
  value = aws_ecs_cluster.main.id
}

output "frontend_service_name" {
  value = aws_ecs_service.frontend.name
}

output "api_gateway_service_name" {
  value = aws_ecs_service.api_gateway.name
}

output "ml_service_service_name" {
  value = aws_ecs_service.ml_service.name
}

output "migration_task_definition_arn" {
  value = aws_ecs_task_definition.api_migrate.arn
}

output "migration_run_command" {
  description = "Run this command to execute database migrations before first deploy"
  value = join(" ", [
    "aws ecs run-task",
    "--cluster ${aws_ecs_cluster.main.name}",
    "--task-definition ${aws_ecs_task_definition.api_migrate.family}",
    "--launch-type FARGATE",
    "--network-configuration",
    "\"awsvpcConfiguration={subnets=[${join(",", var.app_subnet_ids)}],securityGroups=[${var.api_gateway_security_group_id}],assignPublicIp=ENABLED}\"",
  ])
}
