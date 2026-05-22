#!/bin/bash
# templatefile({}) procesa $${...} → ${...} para bash; bare $VAR pasa sin cambios.
set -euo pipefail

# ── Sistema ───────────────────────────────────────────────────────────────────
dnf update -y

# ── Docker ────────────────────────────────────────────────────────────────────
dnf install -y docker
systemctl start docker
systemctl enable docker
usermod -aG docker ec2-user

# ── Nginx (config base sin virtual hosts — se añaden con add-api.sh) ─────────
dnf install -y nginx

cat > /etc/nginx/nginx.conf << 'NGINX_MAIN'
user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log notice;
pid /run/nginx.pid;

include /usr/share/nginx/modules/*.conf;

events {
    worker_connections 1024;
}

http {
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';

    access_log /var/log/nginx/access.log main;

    sendfile            on;
    tcp_nopush          on;
    keepalive_timeout   65;
    types_hash_max_size 4096;

    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    include /etc/nginx/conf.d/*.conf;
}
NGINX_MAIN

systemctl start nginx
systemctl enable nginx

# ── Certbot ───────────────────────────────────────────────────────────────────
dnf install -y python3-certbot-nginx

# ── deploy.sh ─────────────────────────────────────────────────────────────────
# Uso: ./deploy.sh <imagen> <nombre_contenedor> <puerto_host>
# El contenedor siempre expone el puerto 3000 internamente.
# Busca /home/ec2-user/.env.<nombre_contenedor> y si no existe usa .env
cat > /home/ec2-user/deploy.sh << 'DEPLOY_SCRIPT'
#!/bin/bash
set -euo pipefail

IMAGE="$${1:?Uso: ./deploy.sh <imagen> <contenedor> <puerto_host>}"
CONTAINER="$${2:?Uso: ./deploy.sh <imagen> <contenedor> <puerto_host>}"
HOST_PORT="$${3:?Uso: ./deploy.sh <imagen> <contenedor> <puerto_host>}"

ENV_FILE="/home/ec2-user/.env.$CONTAINER"
if [ ! -f "$ENV_FILE" ]; then
  ENV_FILE="/home/ec2-user/.env"
fi

echo "[deploy] Deteniendo contenedor anterior: $CONTAINER"
docker stop "$CONTAINER" 2>/dev/null || true
docker rm   "$CONTAINER" 2>/dev/null || true

echo "[deploy] Iniciando $CONTAINER en puerto $HOST_PORT → imagen $IMAGE"
if [ -f "$ENV_FILE" ]; then
  docker run -d \
    --name    "$CONTAINER" \
    --restart unless-stopped \
    -p        "$HOST_PORT:3000" \
    --env-file "$ENV_FILE" \
    -v /home/ec2-user/key:/home/ec2-user/key:ro \
    "$IMAGE"
else
  echo "[deploy] ADVERTENCIA: no se encontró $ENV_FILE"
  docker run -d \
    --name    "$CONTAINER" \
    --restart unless-stopped \
    -p        "$HOST_PORT:3000" \
    -v /home/ec2-user/key:/home/ec2-user/key:ro \
    "$IMAGE"
fi

docker image prune -f
echo "[deploy] Listo."
DEPLOY_SCRIPT

# ── add-api.sh ────────────────────────────────────────────────────────────────
# Registra un nuevo subdominio en Nginx y obtiene el certificado SSL.
# Uso: ./add-api.sh <subdominio_completo> <puerto_host> [email]
# Ejemplo: ./add-api.sh api2.alfredo-dominguez.dev 3001
cat > /home/ec2-user/add-api.sh << 'ADD_API_SCRIPT'
#!/bin/bash
set -euo pipefail

SUBDOMAIN="$${1:?Uso: ./add-api.sh <subdominio> <puerto> [email]}"
PORT="$${2:?Uso: ./add-api.sh <subdominio> <puerto> [email]}"
EMAIL="${3:-desarrollo@bartik-ing.com}"
CONF="/etc/nginx/conf.d/$SUBDOMAIN.conf"

if [ -f "$CONF" ]; then
  echo "[add-api] $CONF ya existe — solo renovando certificado."
else
  sudo tee "$CONF" > /dev/null << NGINX_VHOST
server {
    listen 80;
    server_name $SUBDOMAIN;

    location / {
        proxy_pass          http://localhost:$PORT;
        proxy_http_version  1.1;
        proxy_set_header    Upgrade            \$http_upgrade;
        proxy_set_header    Connection         'upgrade';
        proxy_set_header    Host               \$host;
        proxy_set_header    X-Real-IP          \$remote_addr;
        proxy_set_header    X-Forwarded-For    \$proxy_add_x_forwarded_for;
        proxy_set_header    X-Forwarded-Proto  \$scheme;
        proxy_cache_bypass  \$http_upgrade;
        proxy_read_timeout  90;
    }
}
NGINX_VHOST

  sudo nginx -t && sudo systemctl reload nginx
  echo "[add-api] Nginx configurado: $SUBDOMAIN → localhost:$PORT"
fi

sudo certbot --nginx \
  -d "$SUBDOMAIN" \
  --non-interactive \
  --agree-tos \
  -m "$EMAIL" \
  --redirect

echo "[add-api] HTTPS activo en https://$SUBDOMAIN"
ADD_API_SCRIPT

chmod +x /home/ec2-user/deploy.sh /home/ec2-user/add-api.sh
chown ec2-user:ec2-user /home/ec2-user/deploy.sh /home/ec2-user/add-api.sh
