import { Router } from 'express';
import { nanoid } from 'nanoid';
import { uploadFileS3, listFilesS3, deleteFileS3 } from '../AWS/S3/index.js';
import firmarUrl from '../AWS/cloudfront/index.js';
import { AppError } from '../middlewares/errorHandler.js';
import { CLOUDFRONT_DOMAIN } from '../../config.js';

const router = Router();

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
const INPUT_FOLDER = 'image-resize/input/';

// ── POST /files/upload ─────────────────────────────────────────────────────
// Recibe un archivo con field name "image", lo sube al bucket S3 input.
// El evento S3 disparará automáticamente el pipeline Lambda → SQS.
router.post('/upload', async (req, res, next) => {
  try {
    if (!req.files?.image) {
      throw new AppError('No se recibió archivo. Usa el field name "image".', 400, 'MISSING_FILE');
    }

    const file = Array.isArray(req.files.image) ? req.files.image[0] : req.files.image;

    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new AppError(
        `Tipo de archivo no permitido. Permitidos: ${ALLOWED_MIME_TYPES.join(', ')}.`,
        415,
        'INVALID_FILE_TYPE'
      );
    }

    const ext = file.name.split('.').pop().toLowerCase();
    const filename = `${nanoid()}.${ext}`;

    const result = await uploadFileS3(INPUT_FOLDER, filename, file);

    if (!result.success) {
      throw new AppError('Error al subir la imagen al bucket S3.', 502, 'S3_UPLOAD_FAILED');
    }

    const cfUrl = `${CLOUDFRONT_DOMAIN}/${INPUT_FOLDER}${filename}`;

    const signedUrl = await firmarUrl(cfUrl);

    return res.status(201).json({
      success: true,
      message: 'Imagen subida y encolada para procesamiento.',
      data: {
        key: `${INPUT_FOLDER}${filename}`,
        filename: filename,
        url: signedUrl,
        size: file.size,
        mimeType: file.mimetype,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /files ─────────────────────────────────────────────────────────────
// Lista objetos del bucket S3. Usa ?prefix= para filtrar (default: resized/).
// Devuelve URLs firmadas de CloudFront para cada archivo.
router.get('/', async (req, res, next) => {
  try {
    const prefix =
      typeof req.query.prefix === 'string' ? req.query.prefix : 'image-resize/resized/';

    const result = await listFilesS3(prefix);

    if (!result.success) {
      throw new AppError('Error al listar imágenes del bucket S3.', 502, 'S3_LIST_FAILED');
    }

    const files = await Promise.all(
      result.files.map(async (item) => {
        let signedUrl = null;

        if (CLOUDFRONT_DOMAIN) {
          const cfUrl = `${CLOUDFRONT_DOMAIN}/${item.Key}`;
          signedUrl = await firmarUrl(cfUrl);
        }

        return {
          key: item.Key,
          size: item.Size,
          lastModified: item.LastModified,
          url: signedUrl,
        };
      })
    );

    return res.status(200).json({
      success: true,
      data: { count: files.length, files },
    });
  } catch (err) {
    console.error('Error en GET /files:', err);
    next(err);
  }
});

// ── GET /files/signed-url?key=<s3-key> ────────────────────────────────────
// Genera una URL firmada de CloudFront para el key S3 indicado.
router.get('/signed-url', async (req, res, next) => {
  try {
    const { key } = req.query;

    if (!key || typeof key !== 'string') {
      throw new AppError('El query param "key" es requerido.', 400, 'MISSING_KEY');
    }

    if (!CLOUDFRONT_DOMAIN) {
      throw new AppError('CLOUDFRONT_DOMAIN no está configurado.', 500, 'CF_NOT_CONFIGURED');
    }

    const cfUrl = `${CLOUDFRONT_DOMAIN}/${key}`;

    console.info(`Generando URL firmada para: ${cfUrl}`);

    const signedUrl = await firmarUrl(cfUrl);

    return res.status(200).json({
      success: true,
      data: { key, url: signedUrl },
    });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /files?key=<s3-key> ─────────────────────────────────────────────
// Elimina un objeto del bucket S3 por su key completo.
router.delete('/', async (req, res, next) => {
  try {
    const { key } = req.query;

    if (!key || typeof key !== 'string') {
      throw new AppError('El query param "key" es requerido.', 400, 'MISSING_KEY');
    }

    const result = await deleteFileS3(key);

    if (!result.success) {
      throw new AppError('Error al eliminar el archivo del bucket S3.', 502, 'S3_DELETE_FAILED');
    }

    return res.status(200).json({
      success: true,
      message: `Archivo "${key}" eliminado correctamente.`,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
