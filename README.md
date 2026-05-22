# AWS Event-Driven Image Processing Platform

> **Arquitectura 03 — Event-Driven Serverless**
>
> Plataforma de procesamiento de imágenes completamente asíncrona y desacoplada, construida sobre servicios serverless de AWS y provisionada con Terraform.

[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)](https://python.org)
[![Terraform](https://img.shields.io/badge/Terraform-%3E%3D1.4-7B42BC?logo=terraform&logoColor=white)](https://terraform.io)
[![AWS](https://img.shields.io/badge/AWS-Serverless-FF9900?logo=amazonaws&logoColor=white)](https://aws.amazon.com)

---

## Tabla de Contenidos

- [Descripción](#descripción)
- [Arquitectura](#arquitectura)
- [Pipeline de Procesamiento](#pipeline-de-procesamiento)
- [Servicios AWS](#servicios-aws)
- [Estructura del Proyecto](#estructura-del-proyecto)
- [Prerequisitos](#prerequisitos)
- [Puesta en Marcha](#puesta-en-marcha)
- [Infraestructura con Terraform](#infraestructura-con-terraform)
- [Variables de Terraform](#variables-de-terraform)
- [Outputs de Terraform](#outputs-de-terraform)
- [Decisiones Técnicas](#decisiones-técnicas)
- [Seguridad](#seguridad)
- [Costos Estimados](#costos-estimados)
- [Autor](#autor)

---

## Descripción

Esta plataforma demuestra cómo implementar un pipeline de procesamiento de imágenes **orientado a eventos**, donde cada componente está desacoplado y comunicado mediante mensajes asíncronos. Al subir una imagen, el sistema genera automáticamente tres resoluciones (`800×600`, `400×300`, `150×150`) sin que el cliente espere el resultado.

**Qué se demuestra:**

- **Desacoplamiento** mediante SQS como buffer entre el evento S3 y la ejecución de Lambda.
- **Resiliencia** con reintentos automáticos (hasta 3) y Dead-Letter Queue para mensajes fallidos.
- **Escalabilidad** sin provisionamiento: Lambda escala automáticamente según la carga de uploads.
- **Idempotencia** usando DynamoDB como registro de trabajo ya procesado.
- **Contenido privado** servido de forma segura mediante URLs firmadas de CloudFront (expiran en 1 hora).

---

## Arquitectura Private CDN

![Diagrama de arquitectura AWS](/infrastructure//01-private-cdn//infrastructure-private-cdn.png)

## Arquitectura Container backend

![Diagrama de arquitectura AWS](/infrastructure//03-container-backend/infrastructure-container-backend.png)

---

## Pipeline de Procesamiento

| #   | Servicio                     | Acción                                                                                                                       |
| --- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 1   | **API + S3**                 | El usuario sube la imagen vía API REST. El backend la deposita en S3 bajo el prefijo `image-resize/input/`.                  |
| 2   | **S3 Event Notification**    | S3 emite un evento `s3:ObjectCreated:*` con entrega _at-least-once_ hacia SQS en cuanto el objeto está disponible.           |
| 3   | **SQS**                      | Actúa como buffer y garantía de entrega. `VisibilityTimeout = 6× timeout de Lambda`. Tras 3 fallos el mensaje pasa a la DLQ. |
| 4   | **Lambda (Python + Pillow)** | Descarga la imagen en memoria, genera 3 variantes con Pillow (LANCZOS) y las sube a S3 output bajo `resized/`.               |
| 5   | **DynamoDB**                 | Registra el resultado: `imageId`, `status`, rutas S3 de las variantes, dimensiones originales, `processedAt` y TTL.          |
| 6   | **SNS + CloudFront**         | SNS notifica el resultado. Las imágenes se sirven vía CloudFront con URLs firmadas (expiran en 1 hora).                      |

---

## Servicios AWS

| Servicio       | Rol                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------- |
| **S3**         | Almacenamiento de imágenes input (`image-resize/input/`) y output (`image-resize/resized/`) |
| **SQS**        | Cola de mensajes con reintentos automáticos y DLQ para mensajes fallidos                    |
| **Lambda**     | Procesamiento serverless por evento — Python 3.12 + Pillow                                  |
| **DynamoDB**   | Persistencia de metadata con TTL automático de 90 días                                      |
| **SNS**        | Notificaciones fanout (email, webhook, otro Lambda)                                         |
| **CloudFront** | CDN con URLs firmadas (RSA) para servir imágenes de forma privada                           |
| **IAM**        | Roles con mínimo privilegio por función (Lambda no tiene acceso al bucket input)            |
| **CloudWatch** | Log Groups, métricas y alarma sobre DLQ                                                     |

---

## Estructura del Proyecto

```
aws-event-driven-image-processing-platform/
├── backend/                        # API REST Express.js
│   ├── src/
│   │   ├── AWS/
│   │   │   ├── S3/index.js         # Wrappers: upload, list, delete
│   │   │   └── cloudfront/index.js # Firma de URLs con @aws-sdk/cloudfront-signer
│   │   ├── config/app.js           # Configuración centralizada desde env vars
│   │   ├── middlewares/
│   │   │   └── errorHandler.js     # AppError + handler global + notFoundHandler
│   │   ├── routes/
│   │   │   └── files.js            # POST /upload · GET / · GET /signed-url · DELETE /
│   │   ├── app.js                  # Express app (middlewares + rutas)
│   │   └── server.js               # Arranque HTTP
│   ├── .env.example
│   └── package.json
│
├── frontend/                       # SPA Astro + React + Tailwind CSS
│   ├── src/
│   │   ├── components/
│   │   │   ├── ImageProcessor.tsx  # Estado compartido upload ↔ gallery
│   │   │   ├── ImageUploader.tsx   # Drag & drop + validación de MIME
│   │   │   ├── ImageGallery.tsx    # Agrupación por filename, polling, delete
│   │   │   └── ImagePreviewModal.tsx # Modal con dimensiones reales vía naturalWidth/Height
│   │   ├── lib/api.ts              # Cliente HTTP tipado (uploadImage, listImages, deleteImage)
│   │   └── pages/index.astro       # Landing + explicación arquitectura + demo
│   ├── .env.example
│   └── package.json
│
└── infrastructure/
    └── 02-event-driven-serverless/ # Terraform IaC
        ├── main.tf                 # Provider, locals, tags
        ├── variables.tf            # Inputs con validación
        ├── s3.tf                   # Bucket + event notification
        ├── sqs.tf                  # Cola principal + DLQ + políticas
        ├── dynamodb.tf             # Tabla de metadata + TTL
        ├── sns.tf                  # Topic + suscripción email
        ├── iam.tf                  # Rol Lambda + políticas de mínimo privilegio
        ├── lambda.tf               # Función + event source mapping + build
        ├── cloudwatch.tf           # Log groups + alarma DLQ
        ├── outputs.tf              # ARNs y nombres de recursos
        ├── build.py                # Script de empaquetado de Lambda (cross-platform)
        └── lambda/
            ├── handler.py          # Handler Python 3.12
            └── requirements.txt    # Pillow
```

---

## Prerequisitos

| Herramienta | Versión mínima | Uso                |
| ----------- | -------------- | ------------------ |
| Node.js     | 20 LTS         | Backend            |
| Node.js     | 22 LTS         | Frontend           |
| pnpm        | 11             | Gestor de paquetes |
| Python      | 3.12           | Empaquetado Lambda |
| Terraform   | 1.4            | Infraestructura    |
| AWS CLI     | 2.x            | Credenciales       |

Credenciales AWS configuradas con permisos sobre: S3, SQS, Lambda, DynamoDB, SNS, IAM, CloudWatch, CloudFront.

---

## Puesta en Marcha

### 1. Clonar el repositorio

```bash
git clone https://github.com/alfredo0607/aws-event-driven-image-processing-platform.git
cd aws-event-driven-image-processing-platform
```

### 2. Desplegar la infraestructura

```bash
cd infrastructure/02-event-driven-serverless
terraform init
terraform apply -var="env=dev" -var="notification_email=tu@email.com"
```

Anota los outputs: `bucket_name`, `sqs_queue_url`, `dynamodb_table_name`.

### 3. Levantar el backend

```bash
cd backend
cp .env.example .env        # Completar con los outputs de Terraform
pnpm install
pnpm dev                    # http://localhost:3000
```

### 4. Levantar el frontend

```bash
cd frontend
cp .env.example .env        # VITE_API_URL=http://localhost:3000
pnpm install
pnpm dev                    # http://localhost:4321
```

---

## Infraestructura con Terraform

```bash
cd infrastructure/02-event-driven-serverless

# Primera vez
terraform init

# Planificar cambios
terraform plan -var="env=dev"

# Aplicar
terraform apply -var="env=dev"

# Destruir (elimina todos los recursos)
terraform destroy -var="env=dev"
```

> El script `build.py` se ejecuta automáticamente como `local-exec` durante `terraform apply`.
> Requiere Python 3.12 en el PATH. Instala Pillow con binarios Linux (`manylinux2014_x86_64`) para compatibilidad con el runtime de Lambda independientemente del OS del desarrollador.

---

## Variables de Terraform

| Variable                      | Tipo   | Default                     | Descripción                                          |
| ----------------------------- | ------ | --------------------------- | ---------------------------------------------------- |
| `env`                         | string | —                           | Entorno: `dev`, `staging` o `prod`                   |
| `aws_region`                  | string | `us-east-1`                 | Región de despliegue                                 |
| `aws_profile`                 | string | `leader-developer-personal` | Perfil de AWS CLI                                    |
| `notification_email`          | string | `""`                        | Email para suscripción SNS (vacío = sin suscripción) |
| `lambda_timeout`              | number | `60`                        | Timeout de Lambda en segundos                        |
| `lambda_memory_mb`            | number | `512`                       | Memoria de Lambda en MB                              |
| `lambda_reserved_concurrency` | number | `-1`                        | Concurrencia reservada (`-1` = pool general)         |
| `sqs_batch_size`              | number | `10`                        | Mensajes por invocación de Lambda                    |
| `log_retention_days`          | number | `30`                        | Retención de logs en CloudWatch                      |

---

## Outputs de Terraform

| Output                 | Descripción                                                   |
| ---------------------- | ------------------------------------------------------------- |
| `bucket_name`          | Nombre del bucket S3                                          |
| `sqs_queue_url`        | URL de la cola SQS principal                                  |
| `sqs_dlq_url`          | URL de la Dead-Letter Queue                                   |
| `dynamodb_table_name`  | Nombre de la tabla DynamoDB                                   |
| `sns_topic_arn`        | ARN del topic SNS                                             |
| `lambda_function_name` | Nombre de la función Lambda                                   |
| `cloudwatch_log_group` | Nombre del Log Group                                          |
| `env_vars_for_backend` | Variables de entorno listas para copiar al `.env` del backend |

---

## Decisiones Técnicas

### SQS como buffer entre S3 y Lambda

S3 Event Notifications tienen entrega _at-least-once_: el mismo evento puede llegar dos veces en condiciones de red inusuales. Interponer SQS permite:

1. **Reintentos controlados** con `MaxReceiveCount=3` antes de derivar a la DLQ.
2. **`VisibilityTimeout = 6 × Lambda timeout`** — mientras Lambda procesa, SQS oculta el mensaje. Si Lambda falla o supera el timeout, el mensaje vuelve a la cola automáticamente.
3. **Partial Batch Response** (`ReportBatchItemFailures`) — Lambda reporta solo los mensajes fallidos del batch en lugar de reintentar el lote completo.

### Idempotencia en DynamoDB

Antes de procesar, Lambda consulta DynamoDB con el `imageId` (S3 key). Si ya existe, descarta el mensaje. Esto protege contra el doble procesamiento derivado de la semántica _at-least-once_ de S3+SQS.

### CloudFront con URLs Firmadas RSA

Las imágenes no son públicas. CloudFront sirve el contenido solo cuando la URL incluye una firma RSA válida generada con la clave privada del key pair. Las URLs expiran en 1 hora.

### Empaquetado Cross-Platform de Lambda

La función Lambda corre en Linux (`x86_64`). Pillow requiere binarios nativos del SO. El script `build.py` usa `pip install --platform manylinux2014_x86_64 --only-binary :all:` para obtener los binarios correctos independientemente de si el desarrollador está en Windows, macOS o Linux.

---

## Seguridad

- **IAM mínimo privilegio**: el rol de Lambda solo puede leer del bucket input y escribir en el prefijo `resized/` del bucket output. No tiene acceso de escritura al prefix `input/`.
- **SQS SSE**: la cola está cifrada con SSE-SQS (AES-256).
- **DynamoDB encryption at rest**: habilitado por defecto.
- **CloudFront private content**: URLs firmadas con RSA — el bucket S3 no es accesible públicamente.
- **Helmet**: cabeceras de seguridad HTTP en el backend (CSP, HSTS, X-Frame-Options, etc.).
- **Rate limiting**: 100 requests / 15 minutos por IP en todos los endpoints de la API.

---

## Costos Estimados

| Servicio   | Capa gratuita                | Costo posterior                       |
| ---------- | ---------------------------- | ------------------------------------- |
| Lambda     | 1 M requests/mes + 400K GB-s | $0.20/M requests + $0.0000166667/GB-s |
| SQS        | 1 M requests/mes             | $0.40/M requests                      |
| S3         | 5 GB + 20K GET + 2K PUT      | $0.023/GB + $0.0004/1K PUT            |
| DynamoDB   | 25 GB + 25 WCU + 25 RCU      | $0.25/GB + $1.25/M writes             |
| CloudFront | 1 TB tráfico + 10M requests  | $0.0085/GB + $0.0075/10K requests     |

> Estimación de uso moderado (~10K imágenes/mes): **< $5 USD/mes**.

---

## Autor

**Alfredo Jose Dominguez Hernandez**

[![GitHub](https://img.shields.io/badge/GitHub-alfredo0607-181717?logo=github)](https://github.com/alfredo0607/aws-event-driven-image-processing-platform)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-alfredo--jose--dominguez--hernandez-0A66C2?logo=linkedin)](https://www.linkedin.com/in/alfredo-jose-dominguez-hernandez)
