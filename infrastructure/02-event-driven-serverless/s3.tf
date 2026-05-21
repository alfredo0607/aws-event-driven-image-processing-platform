#################################################
# S3 BUCKET — almacenamiento de imágenes input/output
#################################################

resource "aws_s3_bucket" "images" {
  # Nombre único por cuenta y entorno
  bucket = "${local.prefix}-images-${data.aws_caller_identity.current.account_id}"

  tags = merge(local.tags, {
    Name    = "${local.prefix}-images"
    Purpose = "image-storage-input-output"
  })
}

resource "aws_s3_bucket_public_access_block" "images" {
  bucket = aws_s3_bucket.images.id

  block_public_acls       = true
  ignore_public_acls      = true
  block_public_policy     = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "images" {
  bucket = aws_s3_bucket.images.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "images" {
  bucket = aws_s3_bucket.images.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "images" {
  bucket = aws_s3_bucket.images.id

  rule {
    id     = "expire-input-originals"
    status = "Enabled"

    filter {
      prefix = "image-resize/input/"
    }

    expiration {
      days = 7
    }
  }

  rule {
    id     = "expire-resized-outputs"
    status = "Enabled"

    filter {
      prefix = "image-resize/resized/"
    }

    expiration {
      days = 90
    }
  }
}

#################################################
# S3 EVENT NOTIFICATION → SQS
# Dispara cuando se sube un objeto a image-resize/input/
# depends_on: la política de SQS debe existir primero para que AWS
# pueda validar que S3 tiene permiso de escribir en la cola.
#################################################

resource "aws_s3_bucket_notification" "images" {
  depends_on = [aws_sqs_queue_policy.processing]

  bucket = aws_s3_bucket.images.id

  queue {
    queue_arn     = aws_sqs_queue.processing.arn
    events        = ["s3:ObjectCreated:*"]
    filter_prefix = "image-resize/input/"
  }
}
