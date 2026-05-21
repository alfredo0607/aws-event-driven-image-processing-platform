import cfg from '../config/app.js';

const { isDev } = cfg;

/**
 * Centralized application error.
 */
export class AppError extends Error {
  /**
   * @param {string} message
   * @param {number} statusCode
   * @param {string} code
   * @param {object|null} details
   */
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = null) {
    super(message);

    this.name = 'AppError';

    this.statusCode = statusCode;

    this.code = code;

    this.details = details;

    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Translate MySQL errors into API-safe errors.
 */
function translateDbError(err) {
  switch (err.code) {
    case 'ER_DUP_ENTRY': {
      const field = err.message.match(/for key '(.+?)'/)?.[1] ?? 'field';

      return new AppError(`Duplicate value for ${field}.`, 409, 'DUPLICATE_ENTRY');
    }

    case 'ER_ROW_IS_REFERENCED_2':
    case 'ER_NO_REFERENCED_ROW_2':
      return new AppError('Foreign key constraint violation.', 409, 'FK_CONSTRAINT');

    case 'ER_DATA_TOO_LONG':
      return new AppError(
        'One or more fields exceed the maximum allowed length.',
        422,
        'DATA_TOO_LONG'
      );

    case 'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD':
    case 'WARN_DATA_TRUNCATED':
      return new AppError('Invalid value for one of the fields.', 422, 'INVALID_VALUE');

    case 'ECONNREFUSED':
    case 'PROTOCOL_CONNECTION_LOST':
      return new AppError('Database connection lost. Please try again.', 503, 'DB_UNAVAILABLE');

    default:
      return null;
  }
}

/**
 * Express global error handler.
 * Must be registered LAST.
 */
export function errorHandler(err, req, res, _next) {
  // Translate DB errors
  const dbErr = err.code ? translateDbError(err) : null;

  const target = dbErr || err;

  const statusCode = target.statusCode || 500;

  const code = target.code || 'INTERNAL_ERROR';

  const message = target.isOperational
    ? target.message
    : 'An unexpected error occurred. Please try again later.';

  // Logging
  if (isDev || statusCode >= 500) {
    console.error(`[ERROR] ${req.method} ${req.originalUrl} — ${statusCode} ${code}`);

    console.error(err.stack || err.message);
  }

  const body = {
    success: false,

    error: {
      code,

      message,

      ...(target.details && {
        details: target.details,
      }),

      ...(isDev &&
        statusCode >= 500 && {
          stack: err.stack,
        }),
    },
  };

  return res.status(statusCode).json(body);
}

/**
 * 404 route handler.
 */
export function notFoundHandler(req, res, _next) {
  return res.status(404).json({
    success: false,

    error: {
      code: 'ROUTE_NOT_FOUND',

      message: `Route ${req.method} ${req.originalUrl} not found.`,
    },
  });
}
