# ── Stage 1: instalar dependencias de producción ──────────────────────────
FROM node:22-slim AS deps

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# sharp descarga binarios precompilados para linux/x64 automáticamente
RUN pnpm install --frozen-lockfile --prod

# ── Stage 2: imagen final mínima ──────────────────────────────────────────
FROM node:22-slim

RUN groupadd -r app && useradd -r -g app app

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY src/            ./src/
COPY config.js       ./
COPY package.json    ./

USER app

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "src/server.js"]
