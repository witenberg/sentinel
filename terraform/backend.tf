# Uncomment and configure for remote state management.
# The S3 bucket and DynamoDB table must exist before running `terraform init`.
#
# terraform {
#   backend "s3" {
#     bucket         = "sentinel-terraform-state"
#     key            = "sentinel/terraform.tfstate"
#     region         = "us-east-1"
#     encrypt        = true
#     dynamodb_table = "sentinel-terraform-locks"
#   }
# }
