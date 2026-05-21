import express from 'express';
import fileUpload from 'express-fileupload';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import cfg from './config/app.js';
import indexRouter from './routes/index.js';
import filesRouter from './routes/files.js';

import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js';

const app = express();

// ─── Security headers ─────────────────────────────────────────────────────
app.use(helmet());

// ─── CORS ─────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: cfg.cors.origin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// ─── Body parsers ─────────────────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// ─── File upload ──────────────────────────────────────────────────────────
app.use(fileUpload({ limits: { fileSize: 10 * 1024 * 1024 }, abortOnLimit: true }));

// ─── HTTP request logger ──────────────────────────────────────────────────
if (!cfg.isProd) {
  app.use(morgan(cfg.log.level));
} else {
  // In production use a compact format and skip health probes
  app.use(
    morgan('combined', {
      skip: (req) => req.url === '/health',
    })
  );
}

// ─── Global rate limiter ──────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: cfg.rateLimit.windowMs,
  max: cfg.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests. Please wait and try again.',
    },
  },
});

app.use(cfg.prefix, limiter);

// ─── Routes ───────────────────────────────────────────────────────────────
app.use('/', indexRouter);
app.use(cfg.prefix, indexRouter);
app.use(`${cfg.prefix}/files`, filesRouter);

// ─── 404 & error handlers (must be LAST) ─────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
