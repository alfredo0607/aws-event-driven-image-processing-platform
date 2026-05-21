output "bucket_name" {
  description = "Nombre del bucket S3 de imágenes."
  value       = aws_s3_bucket.images.bucket
}

output "bucket_arn" {
  description = "ARN del bucket S3."
  value       = aws_s3_bucket.images.arn
}

output "sqs_queue_url" {
  description = "URL de la cola SQS de procesamiento."
  value       = aws_sqs_queue.processing.id
}

output "sqs_queue_arn" {
  description = "ARN de la cola SQS de procesamiento."
  value       = aws_sqs_queue.processing.arn
}

output "sqs_dlq_url" {
  description = "URL de la Dead-Letter Queue."
  value       = aws_sqs_queue.dlq.id
}

output "dynamodb_table_name" {
  description = "Nombre de la tabla DynamoDB."
  value       = aws_dynamodb_table.images.name
}

output "dynamodb_table_arn" {
  description = "ARN de la tabla DynamoDB."
  value       = aws_dynamodb_table.images.arn
}

output "sns_topic_arn" {
  description = "ARN del topic SNS de notificaciones."
  value       = aws_sns_topic.notifications.arn
}

output "lambda_function_name" {
  description = "Nombre de la función Lambda."
  value       = aws_lambda_function.image_processor.function_name
}

output "lambda_function_arn" {
  description = "ARN de la función Lambda."
  value       = aws_lambda_function.image_processor.arn
}

output "lambda_role_arn" {
  description = "ARN del IAM Role de Lambda."
  value       = aws_iam_role.lambda.arn
}

output "cloudwatch_log_group" {
  description = "Nombre del Log Group de Lambda en CloudWatch."
  value       = aws_cloudwatch_log_group.lambda.name
}

output "env_vars_for_backend" {
  description = "Variables de entorno necesarias para el backend Express."
  value = {
    AWS_BUCKET_NAME = aws_s3_bucket.images.bucket
    AWS_REGION      = var.aws_region
  }
}
