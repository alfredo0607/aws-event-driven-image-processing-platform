/* eslint-disable require-await */
import 'dotenv/config';

// ─── App & Config ─────────────────────────────────────────────────────────
import app from './app.js';

import config from './config/app.js';
const { env, port } = config;

let server;

// ─── Startup ──────────────────────────────────────────────────────────────
async function start() {
  console.info('\n══════════════════════════════════════════════');
  console.info('  Aws Event Driven Image Processing Platform Api — API');
  console.info(`  Environment : ${env}`);
  console.info(`  Node        : ${process.version}`);
  console.info('══════════════════════════════════════════════\n');

  // 2. Start HTTP server
  server = app.listen(port, () => {
    console.info(`\n[SERVER] ✅  Listening on http://localhost:${port}`);
    console.info(`[SERVER]     API prefix : /api/v1`);
    console.info(`[SERVER]     Health     : http://localhost:${port}/health\n`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[SERVER] ❌  Port ${port} is already in use.`);
    } else {
      console.error('[SERVER] ❌  Server error:', err.message);
    }

    process.exit(1);
  });
}

// ─── Graceful shutdown ────────────────────────────────────────────────────
function shutdown(signal) {
  console.info(`\n[SERVER] ${signal} received — shutting down gracefully...`);

  if (server) {
    server.close(() => {
      console.info('[SERVER] HTTP server closed.');

      console.info('[SERVER] Goodbye 👋\n');

      process.exit(0);
    });

    // Force-kill after 10s if connections don't drain
    setTimeout(() => {
      console.error('[SERVER] Forced shutdown after timeout.');
      process.exit(1);
    }, 10_000).unref();
  } else {
    process.exit(0);
  }
}

// ─── Process signal handlers ──────────────────────────────────────────────
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught exception:', err);

  shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled promise rejection:', reason);

  shutdown('unhandledRejection');
});

// ─── Boot ─────────────────────────────────────────────────────────────────
start().catch((err) => {
  console.error('[FATAL] Failed to start server:', err.message);

  process.exit(1);
});
