# Arquitectura 03 — Event-Driven Serverless

## Problema

Procesar tareas asíncronas de forma desacoplada, resiliente y sin gestionar servidores. El caso de uso: procesamiento de imágenes al momento de upload.

## Solución

Lambda + SQS + SNS + S3 Events para un pipeline de procesamiento orientado a eventos con resiliencia end-to-end.

## Cómo Funciona


1 - Upload de imagen y disparo del evento S3
El usuario sube una imagen via API + S3 Presigned PUT URL (recomendado) o directamente. S3 emite un evento s3:ObjectCreated:* en cuanto el objeto está disponible. S3 Event Notifications tienen entrega at-least-once — es posible (aunque raro) recibir el mismo evento dos veces, por eso se implementa idempotencia en Lambda.

2- SQS como buffer y garantía de entrega
S3 envía el evento a SQS. El VisibilityTimeout (360s = 6x el timeout de Lambda) es crítico: mientras Lambda procesa el mensaje, SQS lo oculta. Si Lambda termina exitosamente, elimina el mensaje. Si Lambda falla o se timeout, después de 360s SQS hace el mensaje visible nuevamente para reintento. MaxReceiveCount=3: después de 3 fallos, el mensaje va a la DLQ.

3- Lambda Event Source Mapping y batching
Lambda consume mensajes de SQS en batches de hasta 10. Con ReportBatchItemFailures, Lambda puede indicar cuáles mensajes del batch fallaron (partial batch response) en lugar de fallar el batch completo. ReservedConcurrency=50 previene que un pico de uploads consuma todo el límite de concurrencia regional de Lambda (1000 por defecto).


4- Procesamiento de imagen en Lambda (Python + Pillow)
Lambda descarga la imagen de S3 en memoria. Pillow genera 3 versiones: 800x600 (full), 400x300 (medium), 150x150 (thumbnail). Cada versión se sube a S3 output con un prefix organizado: resized/800x600/uuid.jpg. El procesamiento ocurre en memoria (no hay disco en Fargate/Lambda que sea necesario). Para imágenes >10MB se puede usar /tmp (512MB disponibles en Lambda).


5- Persistencia de metadata en DynamoDB
Lambda hace PutItem en DynamoDB con: imageId (partition key = S3 object key), status ('processed' o 'failed'), sizes (lista de S3 paths de las versiones generadas), processedAt (timestamp ISO), fileSize, mimeType, dimensions originales. La tabla tiene TTL habilitado: los items expiran después de 90 días automáticamente.


6- Notificación via SNS y manejo de DLQ
Lambda publica en SNS con el resultado del procesamiento. SNS puede fanout a múltiples suscriptores: Lambda para notificar al usuario vía WebSocket, email, webhook de terceros. Si Lambda falla 3 veces (SQS MaxReceiveCount), el mensaje va a la DLQ. Una CloudWatch Alarm monitorea ApproximateNumberOfMessagesVisible en la DLQ — si >0, notifica al equipo de operaciones.

## Diagrama

```
Usuario
  │ (upload)
  ▼
S3 Bucket (input)
  │ (S3 Event Notification)
  ▼
SQS Queue (buffer + retry)
  │ (Event Source Mapping)
  ▼
Lambda (procesamiento)
  │              │
  ▼              ▼
S3 (output)   DynamoDB (metadata)
  │
  ▼
SNS → Email / Webhook (notificación)
```

> Diagrama detallado: `diagram.png` (pendiente)

## Servicios AWS

| Servicio   | Rol                                         |
| ---------- | ------------------------------------------- |
| S3         | Almacenamiento de imágenes input/output     |
| SQS        | Cola de mensajes con retry y DLQ            |
| Lambda     | Procesamiento serverless por evento         |
| SNS        | Notificaciones fanout (email, webhook)      |
| DynamoDB   | Almacenamiento NoSQL de resultados/metadata |
| CloudWatch | Logs, métricas y alertas de Lambda          |
| IAM        | Roles con mínimo privilegio por función     |

## Decisiones Técnicas

- [ADR-003: SQS como buffer entre S3 y Lambda](../../docs/decisions/ADR-003-lambda-sqs-vs-direct-invocation.md)

## Consideraciones

### Seguridad

- Lambda execution role con permisos mínimos (solo el bucket output, no input)
- SQS con server-side encryption (SSE-SQS)
- DynamoDB con encryption at rest habilitado

### Costo

- Lambda: primer 1M requests/mes gratis, luego $0.20/M requests
- SQS: primer 1M requests/mes gratis, luego $0.40/M requests
- DynamoDB: $0.25/GB/mes almacenamiento + $1.25/M write units

### Escalabilidad

- Lambda escala automáticamente hasta 1000 ejecuciones concurrentes por región
- SQS desacopla el rate de uploads del rate de procesamiento
- `reservedConcurrentExecutions` para prevenir throttling de downstream services

### Resiliencia

- Dead-Letter Queue (DLQ) captura mensajes tras 3 reintentos
- `visibilityTimeout` = 6x el timeout de Lambda (best practice AWS)
- Idempotency key en DynamoDB para prevenir doble procesamiento

## Demo

Ubicación: [`../../demos/event-processing-demo/`](../../demos/event-processing-demo/)

**Flujo:**

1. Upload de imagen al bucket S3 via UI o CLI
2. S3 Event → SQS → Lambda procesa (resize, metadata extraction)
3. Resultado visible en DynamoDB + notificación SNS

## Estado

- [ ] Diagrama arquitectural
- [ ] Lambda function (Python) para procesamiento de imágenes
- [ ] IaC Terraform
- [ ] Demo funcional end-to-end
- [ ] ADR adicionales documentados
