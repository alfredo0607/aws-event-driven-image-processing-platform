#################################################
# DYNAMODB TABLE — metadata de imágenes procesadas
# Clave: imageId (S3 object key de la imagen original)
# TTL: expiresAt — los ítems expiran a los 90 días automáticamente
#################################################

resource "aws_dynamodb_table" "images" {
  name         = "${local.prefix}-metadata"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "imageId"

  attribute {
    name = "imageId"
    type = "S"
  }

  # TTL: Lambda escribe `expiresAt` como Unix timestamp
  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }

  tags = merge(local.tags, {
    Name    = "${local.prefix}-metadata"
    Purpose = "image-metadata-storage"
  })
}
