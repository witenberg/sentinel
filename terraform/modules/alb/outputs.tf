output "dns_name" {
  value = aws_lb.main.dns_name
}

output "zone_id" {
  value = aws_lb.main.zone_id
}

output "arn" {
  value = aws_lb.main.arn
}

output "frontend_target_group_arn" {
  value = aws_lb_target_group.frontend.arn
}

output "api_gateway_target_group_arn" {
  value = aws_lb_target_group.api_gateway.arn
}

output "arn_suffix" {
  value = aws_lb.main.arn_suffix
}

output "api_gateway_target_group_arn_suffix" {
  value = aws_lb_target_group.api_gateway.arn_suffix
}
