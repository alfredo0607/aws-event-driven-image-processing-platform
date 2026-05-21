#################################################
# BUILD AUTOMÁTICO DEL PAQUETE LAMBDA
# Se ejecuta en `terraform apply` cuando handler.py o
# requirements.txt cambian. Instala Pillow compilado para
# Linux x86_64 (manylinux) dentro de lambda/package/.
#################################################

resource "null_resource" "lambda_build" {
  triggers = {
    handler_md5      = filemd5("${path.module}/lambda/handler.py")
    requirements_md5 = filemd5("${path.module}/lambda/requirements.txt")
  }

  provisioner "local-exec" {
    command     = "python build.py"
    working_dir = path.module
  }
}

#################################################
# LAMBDA DEPLOYMENT PACKAGE
# archive_file depende de null_resource para asegurar que
# lambda/package/ ya existe antes de ser empaquetado.
#################################################

data "archive_file" "lambda" {
  depends_on = [null_resource.lambda_build]

  type        = "zip"
  source_dir  = "${path.module}/lambda/package"
  output_path = "${path.module}/.build/handler.zip"
}

#################################################
# LAMBDA FUNCTION — procesamiento de imágenes
# Runtime: Python 3.12
# Timeout: var.lambda_timeout (default 60 s)
# Memory: var.lambda_memory_mb (default 512 MB)
# reserved_concurrent_executions: -1 = sin reserva,
#   usa el pool general de la cuenta (correcto para dev).
#   En producción cambiar a 50+ en terraform.tfvars.
#################################################

resource "aws_lambda_function" "image_processor" {
  function_name = "${local.prefix}-processor"
  role          = aws_iam_role.lambda.arn

  handler     = "handler.lambda_handler"
  runtime     = "python3.12"
  timeout     = var.lambda_timeout
  memory_size = var.lambda_memory_mb

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
# ReportBatchItemFailures: solo reintenta mensajes
#   fallidos del batch, no el batch completo
#################################################

resource "aws_lambda_event_source_mapping" "sqs_trigger" {
  event_source_arn = aws_sqs_queue.processing.arn
  function_name    = aws_lambda_function.image_processor.arn

  batch_size = var.sqs_batch_size

  function_response_types = ["ReportBatchItemFailures"]
}
