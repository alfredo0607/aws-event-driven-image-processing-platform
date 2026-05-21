#################################################
# SNS TOPIC — notificaciones del pipeline
# Lambda publica aquí tras procesar o fallar.
# Suscriptores opcionales: email, webhook, otra Lambda.
#################################################

resource "aws_sns_topic" "notifications" {
  name = "${local.prefix}-notifications"

  tags = merge(local.tags, {
    Name    = "${local.prefix}-notifications"
    Purpose = "processing-notifications"
  })
}

# Suscripción por email (opcional — solo si notification_email != "")
# AWS enviará un correo de confirmación; debe aceptarse manualmente.
resource "aws_sns_topic_subscription" "email" {
  count = var.notification_email != "" ? 1 : 0

  topic_arn = aws_sns_topic.notifications.arn
  protocol  = "email"
  endpoint  = var.notification_email
}
