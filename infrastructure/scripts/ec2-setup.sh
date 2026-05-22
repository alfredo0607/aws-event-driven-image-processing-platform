#!/bin/bash
# ec2-setup.sh — setup ONE-TIME en la instancia EC2.
# Ejecutar como el usuario que usará el deploy (p.ej. ubuntu o ec2-user).
# NO se ejecuta en CI, es un script manual de preparación del servidor.
set -euo pipefail

EC2_USER="${EC2_USER:-ubuntu}"
ENV_FILE="$HOME/.env.image-api"
DEPLOY_SCRIPT="$HOME/deploy.sh"
NGINX_CONF="/etc/nginx/sites-available/services-resize-image-api.conf"

echo "=== [1/4] Copiando deploy.sh al home del usuario ==="
cp "$(dirname "$0")/deploy.sh" "$DEPLOY_SCRIPT"
chmod +x "$DEPLOY_SCRIPT"
echo "    ✓ $DEPLOY_SCRIPT listo"

echo ""
echo "=== [2/4] Creando .env.image-api (template) ==="
if [[ -f "$ENV_FILE" ]]; then
  echo "    ⚠  $ENV_FILE ya existe — no se sobreescribe"
else
  cat > "$ENV_FILE" <<'EOF'
# ── SERVER ───────────────────────────────────────────────
NODE_ENV=production
PORT=3000
API_PREFIX=/api/v1

# ── CORS ─────────────────────────────────────────────────
# Dominio de Cloudflare Pages, p.ej: https://mi-app.pages.dev
CORS_ORIGIN=https://TU_DOMINIO.pages.dev

# ── RATE LIMITING ─────────────────────────────────────────
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100

# ── LOGS ─────────────────────────────────────────────────
LOG_LEVEL=combined

# ── AWS ──────────────────────────────────────────────────
AWS_REGION=us-east-1
AWS_PUBLIC_KEY=
AWS_PRIVATE_KEY=
AWS_BUCKET_NAME=

# ── CLOUDFRONT ───────────────────────────────────────────
CLOUDFRONT_KEYPAIR_ID=
CLOUDFRONT_PRIVATE_KEY=/run/secrets/cf_private_key
CLOUDFRONT_DOMAIN=https://xxxxxxxxxxxx.cloudfront.net
EOF
  chmod 600 "$ENV_FILE"
  echo "    ✓ $ENV_FILE creado — EDÍTALO con los valores reales antes del primer deploy"
fi

echo ""
echo "=== [3/4] Instalando nginx config ==="
sudo cp "$(dirname "$0")/../nginx/services-resize-image-api.conf" "$NGINX_CONF"
sudo ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/
echo "    ✓ Config copiada en $NGINX_CONF"
echo "    ⚠  Obtén el certificado SSL antes de recargar nginx:"
echo "       sudo certbot --nginx -d services-resize-image-api.alfredo.dominguez.com"
echo "    Luego: sudo nginx -t && sudo systemctl reload nginx"

echo ""
echo "=== [4/4] Verificando Docker ==="
if ! command -v docker &>/dev/null; then
  echo "    ✗ Docker no está instalado. Instálalo primero:"
  echo "      https://docs.docker.com/engine/install/ubuntu/"
  exit 1
fi
docker --version
echo "    ✓ Docker disponible"

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  Setup completo. Próximos pasos manuales:           ║"
echo "║  1. Edita $ENV_FILE con los valores reales  ║"
echo "║  2. Obtén certificado SSL con certbot               ║"
echo "║  3. sudo nginx -t && sudo systemctl reload nginx    ║"
echo "║  4. Agrega los GitHub Secrets:                      ║"
echo "║     EC2_HOST / EC2_USER / EC2_SSH_KEY               ║"
echo "╚══════════════════════════════════════════════════════╝"
