#################################################
# LAMBDA DEPLOYMENT PACKAGE
# Empaqueta lambda/handler.py.
# Ejecutar `python build.py` antes de `terraform apply`
# para incluir Pillow en lambda/package/.
#################################################

data "archive_file" "lambda" {
  type        = "zip"
  source_file = "${path.module}/lambda/handler.py"
  output_path = "${path.module}/.build/handler.zip"
}

#################################################
# LAMBDA FUNCTION — procesamiento de imágenes
# Runtime: Python 3.12
# Timeout: var.lambda_timeout (default 60 s)
# Memory: var.lambda_memory_mb (default 512 MB)
# ReservedConcurrency: var.lambda_reserved_concurrency (default 50)
#   → previene que un pico de uploads consuma todo el límite regional (1000)
#################################################

resource "aws_lambda_function" "image_processor" {
  function_name = "${local.prefix}-processor"
  role          = aws_iam_role.lambda.arn

  handler  = "handler.lambda_handler"
  runtime  = "python3.12"
  timeout  = var.lambda_timeout
  memory_size = var.lambda_memory_mb

  # Limite de concurrencia: 50 invocaciones simultáneas
  reserved_concurrent_executions = var.lambda_reserved_concurrency

  filename         = data.archive_file.lambda.output_path
  source_code_hash = data.archive_file.lambda.output_base64sha256

  environment {
    variables = {
      BUCKET_NAME    = aws_s3_bucket.images.bucket
      DYNAMODB_TABLE = aws_dynamodb_table.images.name
      SNS_TOPIC_ARN  = aws_sns_topic.notifications.arn
      RESIZED_PREFIX = "image-resize/resized"
      ENVIRONMENT    = var.env
    }
  }

  tags = merge(local.tags, {
    Name    = "${local.prefix}-processor"
    Purpose = "image-processing-function"
  })
}

#################################################
# EVENT SOURCE MAPPING — SQS → Lambda
# batch_size: hasta 10 mensajes por invocación
# ReportBatchItemFailures: respuesta parcial de fallos,
#   evita reintentar mensajes exitosos del mismo batch
#################################################

resource "aws_lambda_event_source_mapping" "sqs_trigger" {
  event_source_arn = aws_sqs_queue.processing.arn
  function_name    = aws_lambda_function.image_processor.arn

  batch_size = var.sqs_batch_size

  function_response_types = ["ReportBatchItemFailures"]
}
