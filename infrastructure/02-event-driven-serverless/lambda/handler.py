"""
Lambda function: procesa imágenes de S3 disparadas por eventos SQS.

Flujo:
  S3 ObjectCreated → SQS → este handler → 3 versiones en S3 + DynamoDB + SNS

Implementa:
  - ReportBatchItemFailures: solo reintenta mensajes fallidos del batch
  - Idempotencia via DynamoDB: evita doble procesamiento si el evento llega dos veces
  - S3 TestEvent: ignora eventos de prueba enviados al configurar notificaciones
"""

import boto3
import datetime
import io
import json
import os
import time
import urllib.parse

from PIL import Image

# ── Clientes AWS ──────────────────────────────────────────────────────────────

s3_client  = boto3.client("s3")
dynamodb   = boto3.resource("dynamodb")
sns_client = boto3.client("sns")

# ── Variables de entorno ──────────────────────────────────────────────────────

BUCKET_NAME    = os.environ["BUCKET_NAME"]
TABLE_NAME     = os.environ["DYNAMODB_TABLE"]
SNS_TOPIC_ARN  = os.environ["SNS_TOPIC_ARN"]
RESIZED_PREFIX = os.environ.get("RESIZED_PREFIX", "image-resize/resized")
ENVIRONMENT    = os.environ.get("ENVIRONMENT", "dev")

# ── Configuración de resizing ─────────────────────────────────────────────────

SIZES = [
    ("800x600", 800, 600),
    ("400x300", 400, 300),
    ("150x150", 150, 150),
]

FORMAT_MAP = {
    "jpg":  "JPEG",
    "jpeg": "JPEG",
    "png":  "PNG",
    "gif":  "GIF",
    "webp": "WEBP",
    "svg":  "PNG",   # Pillow no soporta SVG → convierte a PNG
}


# ── Handler principal ─────────────────────────────────────────────────────────

def lambda_handler(event, context):
    """
    Punto de entrada. Itera sobre los registros SQS del batch.
    Retorna batchItemFailures para que SQS reintente solo los mensajes fallidos.
    """
    failed = []

    for record in event.get("Records", []):
        message_id = record["messageId"]
        try:
            _process_sqs_record(record)
        except Exception as exc:
            print(f"[ERROR] messageId={message_id}: {exc}")
            failed.append({"itemIdentifier": message_id})

    return {"batchItemFailures": failed}


# ── Procesamiento de un registro SQS ─────────────────────────────────────────

def _process_sqs_record(record: dict) -> None:
    body = json.loads(record["body"])

    # S3 envía un evento de prueba al configurar la notificación → ignorar
    if body.get("Event") == "s3:TestEvent":
        print("[INFO] S3 test event recibido, ignorando.")
        return

    for s3_record in body.get("Records", []):
        bucket = s3_record["s3"]["bucket"]["name"]
        key    = urllib.parse.unquote_plus(s3_record["s3"]["object"]["key"])
        size   = s3_record["s3"]["object"].get("size", 0)
        _process_image(bucket, key, size)


# ── Procesamiento de una imagen ───────────────────────────────────────────────

def _process_image(bucket: str, key: str, file_size: int) -> None:
    table = dynamodb.Table(TABLE_NAME)

    # Idempotencia: si ya fue procesada, salir sin hacer nada
    existing = table.get_item(Key={"imageId": key})
    if existing.get("Item", {}).get("status") == "processed":
        print(f"[INFO] Ya procesada (idempotente): {key}")
        return

    print(f"[INFO] Procesando: {key} ({file_size} bytes)")

    # Descargar imagen de S3
    response     = s3_client.get_object(Bucket=bucket, Key=key)
    image_data   = response["Body"].read()
    content_type = response.get("ContentType", "image/jpeg")

    img = Image.open(io.BytesIO(image_data))
    original_w, original_h = img.size

    ext      = key.rsplit(".", 1)[-1].lower()
    base     = key.rsplit("/", 1)[-1].rsplit(".", 1)[0]
    fmt      = FORMAT_MAP.get(ext, "JPEG")
    out_ext  = "png" if ext == "svg" else ext
    out_mime = "image/png" if ext == "svg" else content_type

    # Generar las 3 versiones redimensionadas
    generated_keys = []
    for label, max_w, max_h in SIZES:
        resized = img.copy()
        resized.thumbnail((max_w, max_h), Image.LANCZOS)

        buf = io.BytesIO()
        save_kwargs = {"format": fmt}
        if fmt == "JPEG":
            save_kwargs["quality"] = 85
            save_kwargs["optimize"] = True
        resized.save(buf, **save_kwargs)
        buf.seek(0)

        output_key = f"{RESIZED_PREFIX}/{label}/{base}.{out_ext}"
        s3_client.put_object(
            Bucket=BUCKET_NAME,
            Key=output_key,
            Body=buf.getvalue(),
            ContentType=out_mime,
            ContentDisposition="inline",
        )
        generated_keys.append(output_key)
        print(f"[INFO] Subida: {output_key}")

    now_iso  = datetime.datetime.utcnow().isoformat() + "Z"
    ttl_unix = int(time.time()) + 90 * 24 * 3600  # expira en 90 días

    # Persistir metadata en DynamoDB
    table.put_item(
        Item={
            "imageId":    key,
            "status":     "processed",
            "sizes":      generated_keys,
            "originalKey": key,
            "fileSize":   file_size,
            "mimeType":   content_type,
            "dimensions": f"{original_w}x{original_h}",
            "processedAt": now_iso,
            "expiresAt":  ttl_unix,
            "environment": ENVIRONMENT,
        }
    )

    # Notificar vía SNS
    sns_client.publish(
        TopicArn=SNS_TOPIC_ARN,
        Subject=f"[{ENVIRONMENT}] Imagen procesada: {base}",
        Message=json.dumps(
            {
                "event":      "IMAGE_PROCESSED",
                "imageId":    key,
                "sizes":      generated_keys,
                "dimensions": f"{original_w}x{original_h}",
                "fileSize":   file_size,
                "timestamp":  now_iso,
                "environment": ENVIRONMENT,
            },
            ensure_ascii=False,
        ),
    )

    print(f"[INFO] Completado: {key} → {generated_keys}")
