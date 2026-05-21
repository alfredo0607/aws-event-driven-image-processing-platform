# Backend — AWS Event-Driven Image Processing Platform

> API REST construida con **Express.js v5** y **Node.js ≥ 20** que actúa como puerta de entrada al pipeline de procesamiento de imágenes en AWS. Gestiona la subida de archivos a S3, lista el contenido procesado y genera URLs firmadas de CloudFront para acceso privado a las imágenes.

---

## Tabla de Contenidos

- [Stack Tecnológico](#stack-tecnológico)
- [Estructura del Proyecto](#estructura-del-proyecto)
- [Prerequisitos](#prerequisitos)
- [Instalación](#instalación)
- [Variables de Entorno](#variables-de-entorno)
- [Scripts Disponibles](#scripts-disponibles)
- [API Reference](#api-reference)
  - [POST /api/v1/files/upload](#post-apiv1filesupload)
  - [GET /api/v1/files](#get-apiv1files)
  - [GET /api/v1/files/signed-url](#get-apiv1filessigned-url)
  - [DELETE /api/v1/files](#delete-apiv1files)
- [Arquitectura Interna](#arquitectura-interna)
- [Manejo de Errores](#manejo-de-errores)
- [Seguridad](#seguridad)
- [Autor](#autor)

---

## Stack Tecnológico

| Librería | Versión | Propósito |
|----------|---------|-----------|
| `express` | ^5.2 | Framework HTTP |
| `express-fileupload` | ^1.5 | Parsing de archivos multipart/form-data |
| `express-rate-limit` | ^8.5 | Rate limiting por IP |
| `helmet` | ^8.1 | Cabeceras de seguridad HTTP |
| `cors` | ^2.8 | Control de CORS |
| `morgan` | ^1.10 | Logger de requests HTTP |
| `@aws-sdk/client-s3` | ^3.1048 | Operaciones sobre S3 |
| `@aws-sdk/cloudfront-signer` | ^3.1048 | Firma de URLs CloudFront con RSA |
| `nanoid` | ^5.1 | Generación de IDs únicos para filenames |
| `dotenv` | ^17.4 | Carga de variables de entorno |

**Dev tools:** ESLint v10 · Prettier · Nodemon · cross-env

---

## Estructura del Proyecto

```
backend/
├── src/
│   ├── AWS/
│   │   ├── S3/
│   │   │   └── index.js            # uploadFileS3 | listFilesS3 | deleteFileS3
│   │   └── cloudfront/
│   │       └── index.js            # firmarUrl — firma RSA con getSignedUrl
│   ├── config/
│   │   └── app.js                  # Configuración centralizada (env vars → objeto tipado)
│   ├── middlewares/
│   │   └── errorHandler.js         # AppError + errorHandler + notFoundHandler
│   ├── routes/
│   │   ├── index.js                # GET /health
│   │   └── files.js                # CRUD de archivos S3
│   ├── app.js                      # Composición de middlewares y rutas
│   └── server.js                   # Arranque del servidor HTTP
├── .env.example                    # Plantilla de variables de entorno
├── .eslintrc.js
├── .prettierrc
└── package.json
```

---

## Prerequisitos

- Node.js ≥ 20 LTS
- pnpm ≥ 11
- Cuenta de AWS con permisos sobre S3 y CloudFront
- Par de claves RSA para firma de URLs de CloudFront (Key Pair ID + clave privada)

---

## Instalación

```bash
cd backend
pnpm install
cp .env.example .env
# Editar .env con los valores reales
pnpm dev
```

---

## Variables de Entorno

Crea un archivo `.env` en la raíz de `backend/` basándote en `.env.example`:

```dotenv
# ── Entorno ──────────────────────────────────────────────────────────────────
NODE_ENV=development          # development | production
PORT=3000
API_PREFIX=/api/v1

# ── CORS ─────────────────────────────────────────────────────────────────────
CORS_ORIGIN=http://localhost:4321   # URL del frontend en dev

# ── Rate Limiting ─────────────────────────────────────────────────────────────
RATE_LIMIT_WINDOW_MS=900000   # 15 minutos en ms
RATE_LIMIT_MAX=100            # Máximo de requests por ventana por IP

# ── AWS ───────────────────────────────────────────────────────────────────────
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=<tu-access-key>
AWS_SECRET_ACCESS_KEY=<tu-secret-key>
AWS_BUCKET_NAME=<nombre-del-bucket-s3>  # Output de Terraform: bucket_name

# ── CloudFront ────────────────────────────────────────────────────────────────
CLOUDFRONT_DOMAIN=https://<id>.cloudfront.net   # Sin trailing slash
CLOUDFRONT_KEY_PAIR_ID=<K1ABCDEF...>            # ID del Key Pair en CloudFront
CLOUDFRONT_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
```

> **Nota de seguridad:** Nunca commitees el archivo `.env`. Está incluido en `.gitignore`.

---

## Scripts Disponibles

```bash
pnpm dev           # Servidor con hot-reload (Nodemon) en http://localhost:3000
pnpm start         # Servidor de producción (node directo)
pnpm prod          # Servidor con NODE_ENV=production
pnpm lint          # Análisis estático con ESLint
pnpm lint:fix      # Corrige errores de ESLint automáticamente
pnpm format        # Formatea con Prettier
pnpm format:check  # Verifica formato sin modificar
```

---

## API Reference

Base URL: `http://localhost:3000/api/v1`

Todos los endpoints siguen el contrato:

```jsonc
// Éxito
{ "success": true, "data": { ... } }

// Error
{ "success": false, "error": { "code": "ERROR_CODE", "message": "..." } }
```

---

### POST /api/v1/files/upload

Sube una imagen al bucket S3 en el prefijo `image-resize/input/`. El evento S3 dispara automáticamente el pipeline Lambda → SQS.

**Content-Type:** `multipart/form-data`

**Field:** `image` (requerido) — archivo de imagen

**MIME types permitidos:** `image/jpeg`, `image/png`, `image/gif`, `image/webp`, `image/svg+xml`

**Límite de tamaño:** 10 MB

**Request (curl):**

```bash
curl -X POST http://localhost:3000/api/v1/files/upload \
  -F "image=@/ruta/a/foto.jpg"
```

**Response 201:**

```json
{
  "success": true,
  "message": "Imagen subida y encolada para procesamiento.",
  "data": {
    "key": "image-resize/input/abc123.jpg",
    "filename": "abc123.jpg",
    "url": "https://<cdn>.cloudfront.net/image-resize/input/abc123.jpg?...<firma>",
    "size": 204800,
    "mimeType": "image/jpeg"
  }
}
```

**Errores posibles:**

| Código HTTP | `error.code` | Causa |
|-------------|--------------|-------|
| 400 | `MISSING_FILE` | No se envió el field `image` |
| 415 | `INVALID_FILE_TYPE` | MIME type no permitido |
| 502 | `S3_UPLOAD_FAILED` | Error al subir a S3 |

---

### GET /api/v1/files

Lista los objetos del bucket S3 con URLs firmadas de CloudFront. Por defecto lista las imágenes ya procesadas (`image-resize/resized/`).

**Query params:**

| Parámetro | Tipo | Default | Descripción |
|-----------|------|---------|-------------|
| `prefix` | string | `image-resize/resized/` | Prefijo S3 a listar |

**Request:**

```bash
curl http://localhost:3000/api/v1/files
# Con prefijo personalizado:
curl "http://localhost:3000/api/v1/files?prefix=image-resize/input/"
```

**Response 200:**

```json
{
  "success": true,
  "data": {
    "count": 3,
    "files": [
      {
        "key": "image-resize/resized/800x600/abc123.jpg",
        "size": 98304,
        "lastModified": "2025-05-20T14:32:10.000Z",
        "url": "https://<cdn>.cloudfront.net/image-resize/resized/800x600/abc123.jpg?...<firma>"
      },
      {
        "key": "image-resize/resized/400x300/abc123.jpg",
        "size": 45056,
        "lastModified": "2025-05-20T14:32:11.000Z",
        "url": "https://<cdn>.cloudfront.net/image-resize/resized/400x300/abc123.jpg?...<firma>"
      },
      {
        "key": "image-resize/resized/150x150/abc123.jpg",
        "size": 12288,
        "lastModified": "2025-05-20T14:32:11.000Z",
        "url": "https://<cdn>.cloudfront.net/image-resize/resized/150x150/abc123.jpg?...<firma>"
      }
    ]
  }
}
```

**Errores posibles:**

| Código HTTP | `error.code` | Causa |
|-------------|--------------|-------|
| 502 | `S3_LIST_FAILED` | Error al consultar S3 |

---

### GET /api/v1/files/signed-url

Genera una URL firmada de CloudFront para un objeto S3 específico, a partir de su S3 key completo.

**Query params:**

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `key` | string | Sí | S3 key completo, ej: `image-resize/resized/800x600/abc123.jpg` |

**Request:**

```bash
curl "http://localhost:3000/api/v1/files/signed-url?key=image-resize/resized/800x600/abc123.jpg"
```

**Response 200:**

```json
{
  "success": true,
  "data": {
    "key": "image-resize/resized/800x600/abc123.jpg",
    "url": "https://<cdn>.cloudfront.net/image-resize/resized/800x600/abc123.jpg?...<firma>"
  }
}
```

**Errores posibles:**

| Código HTTP | `error.code` | Causa |
|-------------|--------------|-------|
| 400 | `MISSING_KEY` | Query param `key` ausente |
| 500 | `CF_NOT_CONFIGURED` | `CLOUDFRONT_DOMAIN` no configurado |

---

### DELETE /api/v1/files

Elimina un objeto del bucket S3 a partir de su S3 key.

**Query params:**

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `key` | string | Sí | S3 key completo del objeto a eliminar |

**Request:**

```bash
curl -X DELETE "http://localhost:3000/api/v1/files?key=image-resize/resized/800x600/abc123.jpg"
```

**Response 200:**

```json
{
  "success": true,
  "message": "Archivo \"image-resize/resized/800x600/abc123.jpg\" eliminado correctamente."
}
```

**Errores posibles:**

| Código HTTP | `error.code` | Causa |
|-------------|--------------|-------|
| 400 | `MISSING_KEY` | Query param `key` ausente |
| 502 | `S3_DELETE_FAILED` | Error al eliminar en S3 |

---

## Arquitectura Interna

### Middleware Stack (en orden de ejecución)

```
Request
  ↓ helmet()              — Cabeceras de seguridad (CSP, HSTS, X-Frame-Options…)
  ↓ cors()                — Validación de origen y preflight OPTIONS
  ↓ express.json()        — Body parser JSON (límite 2 MB)
  ↓ express.urlencoded()  — Body parser URL-encoded (límite 2 MB)
  ↓ fileUpload()          — Parsing multipart/form-data (límite 10 MB)
  ↓ morgan()              — Log del request
  ↓ rateLimit()           — 100 req / 15 min por IP
  ↓ router                — Lógica de negocio
  ↓ notFoundHandler       — 404 para rutas desconocidas
  ↓ errorHandler          — Normalización de errores → { success: false, error: {...} }
Response
```

### Flujo de Upload

```
POST /upload
  │
  ├─ Valida presencia del field "image"
  ├─ Valida MIME type contra lista permitida
  ├─ Genera filename único: nanoid() + extensión original
  ├─ uploadFileS3("image-resize/input/", filename, file)
  ├─ Construye URL de CloudFront: CLOUDFRONT_DOMAIN + "/" + key
  ├─ firmarUrl(cfUrl)  →  URL firmada con expiración 1h
  └─ Responde 201 con { key, filename, url, size, mimeType }
```

### Firma de URLs CloudFront

La función `firmarUrl` usa `getSignedUrl` del paquete `@aws-sdk/cloudfront-signer`. Requiere:

- `CLOUDFRONT_KEY_PAIR_ID`: ID del Key Pair creado en la consola de CloudFront.
- `CLOUDFRONT_PRIVATE_KEY`: Clave privada RSA en formato PEM (puede incluir `\n` literales en el `.env`).
- La URL base del recurso CloudFront.

Las URLs firmadas expiran en **1 hora** por defecto.

---

## Manejo de Errores

Todos los errores del negocio se lanzan como instancias de `AppError`:

```js
throw new AppError(message, statusCode, errorCode);
// Ejemplo: throw new AppError('No se recibió archivo.', 400, 'MISSING_FILE')
```

El `errorHandler` global captura cualquier error (incluyendo errores inesperados) y responde siempre con la estructura:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Descripción del error"
  }
}
```

En producción (`NODE_ENV=production`), los errores no operacionales (bugs, excepciones no controladas) responden con mensaje genérico para no exponer detalles internos.

---

## Seguridad

| Medida | Implementación |
|--------|----------------|
| Cabeceras HTTP seguras | `helmet()` — activa CSP, HSTS, X-Frame-Options, etc. |
| Rate limiting | 100 req/15 min/IP vía `express-rate-limit` con cabeceras estándar |
| Validación de MIME | Whitelist estricta antes de cualquier operación S3 |
| CORS restringido | Solo el origen configurado en `CORS_ORIGIN` |
| Credenciales AWS | Nunca en código — solo vía variables de entorno |
| URLs firmadas | Acceso privado a S3 vía CloudFront con expiración |

---

## Autor

**Alfredo Jose Dominguez Hernandez**

[![GitHub](https://img.shields.io/badge/GitHub-alfredo0607-181717?logo=github)](https://github.com/alfredo0607/aws-event-driven-image-processing-platform)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-alfredo--jose--dominguez--hernandez-0A66C2?logo=linkedin)](https://www.linkedin.com/in/alfredo-jose-dominguez-hernandez)
