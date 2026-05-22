/**
 * Central application configuration.
 * All env vars are read ONCE here and exported as typed constants.
 */

const env = process.env.NODE_ENV || 'development';

const config = {
  env,

  port: Number.parseInt(process.env.PORT || '3000', 10),

  prefix: process.env.API_PREFIX || '/api/v1',

  isDev: env === 'development',

  isProd: env === 'production',

  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || '*',
  },

  rateLimit: {
    windowMs: Number.parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),

    max: Number.parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'dev_secret_change_in_production',

    expiresIn: process.env.JWT_EXPIRES_IN || '8h',

    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev_refresh_secret_change_in_production',

    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  log: {
    level: process.env.LOG_LEVEL || 'dev',
  },
};

export default config;
