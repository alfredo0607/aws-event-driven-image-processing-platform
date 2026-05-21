#################################################
# CLOUDWATCH LOG GROUP — logs de Lambda
# Creado explícitamente para controlar retención
# y garantizar que los tags del proyecto se apliquen.
#################################################

resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/${aws_lambda_function.image_processor.function_name}"
  retention_in_days = var.log_retention_days

  tags = merge(local.tags, {
    Name    = "${local.prefix}-lambda-logs"
    Purpose = "lambda-execution-logs"
  })
}

#################################################
# CLOUDWATCH ALARM — mensajes en DLQ
# Se activa si hay ≥1 mensaje visible en la DLQ,
# lo que indica fallos repetidos en el procesamiento.
# Acción: publica en SNS para notificar al equipo de operaciones.
#################################################

resource "aws_cloudwatch_metric_alarm" "dlq_messages" {
  alarm_name          = "${local.prefix}-dlq-not-empty"
  alarm_description   = "La DLQ tiene mensajes — revisa los fallos de procesamiento en Lambda."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 60
  statistic           = "Sum"
  threshold           = 0
  treat_missing_data  = "notBreaching"

  dimensions = {
    QueueName = aws_sqs_queue.dlq.name
  }

  alarm_actions = [aws_sns_topic.notifications.arn]
  ok_actions    = [aws_sns_topic.notifications.arn]

  tags = merge(local.tags, {
    Name    = "${local.prefix}-dlq-alarm"
    Purpose = "dlq-monitoring"
  })
}

#################################################
# CLOUDWATCH ALARM — errores de Lambda
# Se activa si Lambda lanza ≥1 error en el período.
#################################################

resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  alarm_name          = "${local.prefix}-lambda-errors"
  alarm_description   = "Lambda registró errores en el procesamiento de imágenes."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 60
  statistic           = "Sum"
  threshold           = 0
  treat_missing_data  = "notBreaching"

  dimensions = {
    FunctionName = aws_lambda_function.image_processor.function_name
  }

  alarm_actions = [aws_sns_topic.notifications.arn]

  tags = merge(local.tags, {
    Name    = "${local.prefix}-lambda-errors-alarm"
    Purpose = "lambda-error-monitoring"
  })
}

#################################################
# CLOUDWATCH ALARM — throttles de Lambda
# Se activa si Lambda es throttled, lo que indica
# que el reservedConcurrency es insuficiente para la carga.
#################################################

resource "aws_cloudwatch_metric_alarm" "lambda_throttles" {
  alarm_name          = "${local.prefix}-lambda-throttles"
  alarm_description   = "Lambda está siendo throttled — considera aumentar reserved concurrency."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Throttles"
  namespace           = "AWS/Lambda"
  period              = 60
  statistic           = "Sum"
  threshold           = 0
  treat_missing_data  = "notBreaching"

  dimensions = {
    FunctionName = aws_lambda_function.image_processor.function_name
  }

  alarm_actions = [aws_sns_topic.notifications.arn]

  tags = merge(local.tags, {
    Name    = "${local.prefix}-lambda-throttles-alarm"
    Purpose = "lambda-throttle-monitoring"
  })
}
