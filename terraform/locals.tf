locals {
  name_prefix = "${var.project_name}-${var.environment}"

  azs             = var.availability_zones
  public_subnets  = [for i, _ in local.azs : cidrsubnet(var.vpc_cidr, 8, i + 1)]
  private_subnets = [for i, _ in local.azs : cidrsubnet(var.vpc_cidr, 8, i + 11)]

  use_https = var.acm_certificate_arn != ""
  app_url   = local.use_https ? "https://${var.domain_name}" : "http://${module.alb.dns_name}"
}
