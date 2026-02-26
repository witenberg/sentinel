output "frontend_repository_url" {
  value = aws_ecr_repository.app["frontend"].repository_url
}

output "api_gateway_repository_url" {
  value = aws_ecr_repository.app["api-gateway"].repository_url
}

output "ml_service_repository_url" {
  value = aws_ecr_repository.app["ml-service"].repository_url
}
