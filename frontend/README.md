# Frontend — AWS Event-Driven Image Processing Platform

> Interfaz web construida con **Astro 6**, **React 19** y **Tailwind CSS v4** que permite interactuar con el pipeline de procesamiento de imágenes en tiempo real. Muestra la arquitectura del sistema, permite subir imágenes y visualiza las variantes generadas por Lambda.

---

## Tabla de Contenidos

- [Stack Tecnológico](#stack-tecnológico)
- [Estructura del Proyecto](#estructura-del-proyecto)
- [Prerequisitos](#prerequisitos)
- [Instalación](#instalación)
- [Variables de Entorno](#variables-de-entorno)
- [Scripts Disponibles](#scripts-disponibles)
- [Componentes React](#componentes-react)
  - [ImageProcessor](#imageprocessor)
  - [ImageUploader](#imageuploader)
  - [ImageGallery](#imagegallery)
  - [ImagePreviewModal](#imagepreviewmodal)
- [Cliente HTTP](#cliente-http)
- [Flujo de la Aplicación](#flujo-de-la-aplicación)
- [Autor](#autor)

---

## Stack Tecnológico

| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| [Astro](https://astro.build) | ^6.3 | Framework SSG/SSR — enrutamiento y layout base |
| [React](https://react.dev) | ^19.2 | Componentes interactivos (islands architecture) |
| [Tailwind CSS](https://tailwindcss.com) | ^4.3 | Estilos utilitarios, modo oscuro |
| TypeScript | ^6.0 | Tipado estático en componentes y cliente API |
| `@astrojs/react` | ^5.0 | Integración oficial Astro ↔ React |
| `@tailwindcss/vite` | ^4.3 | Plugin Vite para Tailwind v4 (sin `tailwind.config`) |
| pnpm | 11 | Gestor de paquetes |

---

## Estructura del Proyecto

```
frontend/
├── public/                         # Assets estáticos servidos tal cual
├── src/
│   ├── components/
│   │   ├── ImageProcessor.tsx      # Estado compartido upload ↔ gallery (parent)
│   │   ├── ImageUploader.tsx       # Drag & drop, validación MIME, subida
│   │   ├── ImageGallery.tsx        # Lista agrupada, polling, preview, delete
│   │   └── ImagePreviewModal.tsx   # Modal de preview con dimensiones reales
│   ├── layouts/
│   │   └── Layout.astro            # Shell HTML: <head>, fuentes, meta
│   ├── lib/
│   │   └── api.ts                  # Cliente HTTP tipado (uploadImage, listImages, deleteImage)
│   └── pages/
│       └── index.astro             # Única página: explicación + demo interactiva
├── astro.config.mjs                # Config Astro: React + Tailwind vite plugin
├── tsconfig.json
├── .env.example
└── package.json
```

---

## Prerequisitos

- Node.js ≥ 22.12.0
- pnpm ≥ 11
- Backend de la plataforma corriendo (ver [backend/README.md](../backend/README.md))

---

## Instalación

```bash
cd frontend
pnpm install
cp .env.example .env
# Editar .env con la URL del backend
pnpm dev
```

La app quedará disponible en `http://localhost:4321`.

---

## Variables de Entorno

Crea `.env` en la raíz de `frontend/` basándote en `.env.example`:

```dotenv
# URL base del backend (sin trailing slash)
VITE_API_URL=http://localhost:3000
```

> Astro expone las variables prefijadas con `VITE_` al código del cliente vía `import.meta.env.VITE_*`.
> Si la variable no está definida, el cliente HTTP usa `http://localhost:3000` como valor por defecto.

---

## Scripts Disponibles

```bash
pnpm dev        # Servidor de desarrollo con HMR en http://localhost:4321
pnpm build      # Build de producción estático en ./dist/
pnpm preview    # Preview del build de producción local
pnpm astro      # CLI de Astro (astro add, astro check, etc.)
```

---

## Componentes React

Todos los componentes usan `client:load` en Astro para hidratarse en el cliente inmediatamente tras la carga de la página.

---

### ImageProcessor

**Archivo:** [`src/components/ImageProcessor.tsx`](src/components/ImageProcessor.tsx)

Componente contenedor que mantiene el estado compartido entre el uploader y la galería. Es el único componente montado directamente desde `index.astro`.

**Estado:**
- `refreshTrigger: number` — se incrementa tras cada upload exitoso para forzar recarga de la galería.
- `isProcessing: boolean` — activa el polling automático en `ImageGallery` mientras Lambda procesa.

**Props expuestas:** ninguna (es el root de la isla React).

```tsx
// Flujo de coordinación:
// ImageUploader.onUploadSuccess()
//   → setRefreshTrigger(n + 1)   // recarga inmediata de la galería
//   → setIsProcessing(true)      // activa polling cada 4s
//
// ImageGallery.onProcessingComplete()
//   → setIsProcessing(false)     // detiene el polling
```

---

### ImageUploader

**Archivo:** [`src/components/ImageUploader.tsx`](src/components/ImageUploader.tsx)

Zona de drag & drop para seleccionar y subir imágenes al backend.

**Props:**

| Prop | Tipo | Descripción |
|------|------|-------------|
| `onUploadSuccess` | `() => void` | Callback invocado tras upload exitoso |

**Comportamiento:**

- Acepta archivos vía drag & drop o click para abrir el selector del sistema.
- Valida el MIME type del lado del cliente antes de intentar subir: `image/jpeg`, `image/png`, `image/gif`, `image/webp`, `image/svg+xml`.
- Muestra nombre y peso del archivo seleccionado antes de confirmar el upload.
- Muestra estados visuales: `idle` → `uploading` → `success` / `error`.
- Tras un upload exitoso resetea el formulario y limpia el input file.

**MIME types permitidos:** `image/jpeg · image/png · image/gif · image/webp · image/svg+xml`

**Límite:** 10 MB (impuesto también en el backend).

---

### ImageGallery

**Archivo:** [`src/components/ImageGallery.tsx`](src/components/ImageGallery.tsx)

Galería que muestra las imágenes procesadas agrupadas por filename, con sus tres variantes en la misma fila.

**Props:**

| Prop | Tipo | Descripción |
|------|------|-------------|
| `refreshTrigger` | `number` | Cambiar este valor fuerza una recarga de la lista |
| `isProcessing` | `boolean` | Activa el polling automático cada 4 s |
| `onProcessingComplete` | `() => void` | Callback cuando el polling detecta imágenes nuevas o agota el timeout |

**Agrupación de imágenes:**

El backend retorna una lista plana de objetos S3. El componente agrupa por nombre de archivo extrayéndolo del S3 key:

```
image-resize/resized/800x600/abc123.jpg
                     ^^^^^^^ ^^^^^^^^^^^
                     sizeKey  filename
```

Cada grupo muestra las 3 variantes (`800×600`, `400×300`, `150×150`) en un grid de 3 columnas con `divide-x`.

**Polling automático:**

Cuando `isProcessing = true`, el componente sondea `GET /api/v1/files` cada 4 segundos. Se detiene cuando el número de grupos aumenta (imágenes listas) o tras 30 segundos de timeout.

**Eliminación:**

Al eliminar un grupo, se ejecutan en paralelo `DELETE /api/v1/files?key=<key>` para cada una de las 3 variantes (`Promise.all`).

**Preview:**

Cada imagen tiene un overlay de zoom al hacer hover. Al hacer clic se abre `ImagePreviewModal`.

**Subcomponentes internos:**

- `SkeletonGroupCard` — placeholder animado mientras carga.
- `VariantCell` — celda individual de una variante con imagen, label y peso.
- `GroupCard` — tarjeta completa de un grupo: cabecera con filename + botón eliminar + 3 `VariantCell`.

---

### ImagePreviewModal

**Archivo:** [`src/components/ImagePreviewModal.tsx`](src/components/ImagePreviewModal.tsx)

Modal de pantalla completa para visualizar una variante en alta resolución con sus metadatos.

**Props:**

| Prop | Tipo | Descripción |
|------|------|-------------|
| `variant` | `ImageFile` | Objeto con `url`, `size`, `lastModified` |
| `filename` | `string` | Nombre base del archivo, ej: `abc123.jpg` |
| `sizeLabel` | `string` | Etiqueta de la variante: `Full`, `Medium` o `Thumbnail` |
| `dims` | `string` | Dimensiones máximas: `800×600`, `400×300` o `150×150` |
| `onClose` | `() => void` | Callback para cerrar el modal |

**Comportamiento:**

- Se cierra con la tecla `Escape` o haciendo clic fuera del panel.
- Bloquea el scroll del `body` mientras está abierto y lo restaura al cerrar.
- Muestra un spinner mientras la imagen carga.
- Captura las dimensiones reales del archivo en píxeles usando `img.naturalWidth` / `img.naturalHeight` en el evento `onLoad`.
- Muestra fila de metadatos: **Variante** · **Dimensiones reales** · **Peso** · **Procesado**.

---

## Cliente HTTP

**Archivo:** [`src/lib/api.ts`](src/lib/api.ts)

Cliente HTTP tipado que encapsula todas las llamadas al backend. Todas las funciones retornan un `Result<T>` discriminado (nunca lanzan excepciones).

```ts
type Success<T> = { success: true; data: T };
type Failure     = { success: false; error: { code: string; message: string } };
type ApiResult<T> = Success<T> | Failure;
```

**Funciones disponibles:**

```ts
// Sube un archivo al backend (multipart/form-data, field: "image")
uploadImage(file: File): Promise<ApiResult<UploadResponse>>

// Lista imágenes procesadas. Por defecto prefix = 'image-resize/resized/'
listImages(prefix?: string): Promise<ApiResult<{ count: number; files: ImageFile[] }>>

// Elimina un objeto S3 por su key completo
deleteImage(key: string): Promise<ApiResult<never>>
```

**Tipo base:**

```ts
interface ImageFile {
  key:          string;       // S3 key completo
  size:         number;       // Tamaño en bytes
  lastModified: string;       // ISO 8601
  url:          string | null; // URL firmada de CloudFront
}
```

---

## Flujo de la Aplicación

```
Usuario selecciona archivo (drag & drop o click)
  │
  ├─ Validación MIME en cliente
  ├─ Usuario confirma → POST /api/v1/files/upload
  │
  ├─ [éxito] onUploadSuccess()
  │     ├─ refreshTrigger++ → ImageGallery recarga lista inmediatamente
  │     └─ isProcessing = true → polling cada 4s comienza
  │
  │   [Lambda procesando en background...]
  │
  ├─ Polling detecta nuevos grupos (count aumentó)
  │     └─ isProcessing = false → polling se detiene
  │
  └─ Usuario hace clic en una imagen
        └─ ImagePreviewModal se abre con metadatos y dimensiones reales
```

---

## Autor

**Alfredo Jose Dominguez Hernandez**

[![GitHub](https://img.shields.io/badge/GitHub-alfredo0607-181717?logo=github)](https://github.com/alfredo0607/aws-event-driven-image-processing-platform)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-alfredo--jose--dominguez--hernandez-0A66C2?logo=linkedin)](https://www.linkedin.com/in/alfredo-jose-dominguez-hernandez)
