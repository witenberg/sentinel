output "vpc_id" {
  value = aws_vpc.main.id
}

output "public_subnet_ids" {
  value = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  value = aws_subnet.private[*].id
}

output "alb_security_group_id" {
  value = aws_security_group.alb.id
}

output "frontend_security_group_id" {
  value = aws_security_group.frontend.id
}

output "api_gateway_security_group_id" {
  value = aws_security_group.api_gateway.id
}

output "ml_service_security_group_id" {
  value = aws_security_group.ml_service.id
}

output "rds_security_group_id" {
  value = aws_security_group.rds.id
}

output "mq_security_group_id" {
  value = aws_security_group.mq.id
}
