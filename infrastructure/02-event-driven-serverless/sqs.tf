#################################################
# SQS DEAD-LETTER QUEUE
# Recibe mensajes que fallaron 3 veces consecutivas.
# Retención máxima (14 días) para dar tiempo al equipo de revisar.
#################################################

resource "aws_sqs_queue" "dlq" {
  name = "${local.prefix}-dlq"

  message_retention_seconds = 1209600 # 14 días (máximo)
  sqs_managed_sse_enabled   = true

  tags = merge(local.tags, {
    Name    = "${local.prefix}-dlq"
    Purpose = "dead-letter-queue"
  })
}

#################################################
# SQS PROCESSING QUEUE
# Buffer entre el evento S3 y la ejecución de Lambda.
# VisibilityTimeout = 6× el timeout de Lambda (best practice AWS).
# MaxReceiveCount = 3: tras 3 fallos el mensaje pasa a la DLQ.
#################################################

resource "aws_sqs_queue" "processing" {
  name = "${local.prefix}-processing"

  # 6× lambda_timeout: mientras Lambda procesa, SQS oculta el mensaje
  visibility_timeout_seconds = var.lambda_timeout * 6

  message_retention_seconds = 86400 # 1 día
  sqs_managed_sse_enabled   = true

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq.arn
    maxReceiveCount     = 3
  })

  tags = merge(local.tags, {
    Name    = "${local.prefix}-processing"
    Purpose = "image-processing-queue"
  })
}

#################################################
# SQS QUEUE POLICY
# Permite que Amazon S3 publique mensajes en la cola.
# La condición aws:SourceArn restringe el acceso al bucket concreto,
# evitando el confused deputy problem.
#################################################

resource "aws_sqs_queue_policy" "processing" {
  queue_url = aws_sqs_queue.processing.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowS3SendMessage"
        Effect = "Allow"
        Principal = {
          Service = "s3.amazonaws.com"
        }
        Action   = "sqs:SendMessage"
        Resource = aws_sqs_queue.processing.arn
        Condition = {
          ArnEquals = {
            "aws:SourceArn" = aws_s3_bucket.images.arn
          }
        }
      }
    ]
  })
}
