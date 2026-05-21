variable "env" {
  type        = string
  description = "Nombre del entorno (dev, staging, prod)."

  validation {
    condition     = contains(["dev", "staging", "prod"], var.env)
    error_message = "El valor de env debe ser dev, staging o prod."
  }
}

variable "aws_region" {
  type        = string
  description = "Región de AWS donde se despliegan los recursos."
  default     = "us-east-1"
}

variable "aws_profile" {
  type        = string
  description = "Perfil de AWS CLI utilizado para autenticación."
  default     = "leader-developer-personal"
}

variable "notification_email" {
  type        = string
  description = "Email para suscripción SNS. Dejar vacío para omitir suscripción."
  default     = ""
}

variable "lambda_timeout" {
  type        = number
  description = "Timeout de la función Lambda en segundos."
  default     = 60
}

variable "lambda_memory_mb" {
  type        = number
  description = "Memoria asignada a Lambda en MB."
  default     = 512
}

variable "lambda_reserved_concurrency" {
  type        = number
  description = "Concurrencia reservada para Lambda. Previene que un pico consuma todo el límite regional."
  default     = 50
}

variable "sqs_batch_size" {
  type        = number
  description = "Número máximo de mensajes SQS por invocación de Lambda."
  default     = 10
}

variable "log_retention_days" {
  type        = number
  description = "Días de retención de logs en CloudWatch."
  default     = 30
}
