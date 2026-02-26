output "bucket_name" {
  value = aws_s3_bucket.logs.bucket
}

output "bucket_arn" {
  value = aws_s3_bucket.logs.arn
}

output "bucket_id" {
  value = aws_s3_bucket.logs.id
}
