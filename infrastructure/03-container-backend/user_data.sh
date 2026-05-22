#!/bin/bash
# Terraform reemplaza ${app_port} antes de enviar este script a EC2.
# Las variables de Nginx ($host, $remote_addr, etc.) son bare-dollar y pasan intactas.
set -euo pipefail

# ── Sistema ──────────────────────────────────────────────────────────────────
dnf update -y

# ── Docker ───────────────────────────────────────────────────────────────────
dnf install -y docker
systemctl start docker
systemctl enable docker
usermod -aG docker ec2-user

# ── Nginx ────────────────────────────────────────────────────────────────────
dnf install -y nginx

# Config mínima de nginx sin bloques de servidor por defecto
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

# Terraform reemplaza ${domain} y ${app_port} antes de que bash ejecute este script.
# El heredoc con comillas simples evita que bash expanda $http_upgrade, $host, etc.
cat > /etc/nginx/conf.d/backend.conf << 'NGINX_VHOST'
server {
    listen 80;
    server_name ${domain};

    location / {
        proxy_pass          http://localhost:${app_port};
        proxy_http_version  1.1;
        proxy_set_header    Upgrade            $http_upgrade;
        proxy_set_header    Connection         'upgrade';
        proxy_set_header    Host               $host;
        proxy_set_header    X-Real-IP          $remote_addr;
        proxy_set_header    X-Forwarded-For    $proxy_add_x_forwarded_for;
        proxy_set_header    X-Forwarded-Proto  $scheme;
        proxy_cache_bypass  $http_upgrade;
        proxy_read_timeout  90;
    }
}
NGINX_VHOST

systemctl start nginx
systemctl enable nginx

# ── Certbot (Let's Encrypt) ───────────────────────────────────────────────────
# Instala certbot. El certificado se solicita manualmente después de
# apuntar el DNS: sudo certbot --nginx -d ${domain}
dnf install -y python3-certbot-nginx

# ── Script de deploy (reutilizado por el pipeline CI/CD) ─────────────────────
cat > /home/ec2-user/deploy.sh << 'DEPLOY_SCRIPT'
#!/bin/bash
# Uso: ./deploy.sh <imagen>
# Ejemplo: ./deploy.sh ghcr.io/owner/repo/backend:sha-abc123
set -euo pipefail

IMAGE="$${1:?Error: indica la imagen. Uso: ./deploy.sh <imagen>}"
CONTAINER="${2:?Error: indica el nombre del contenedor}"
ENV_FILE="/home/ec2-user/.env"

echo "[deploy] Deteniendo contenedor anterior..."
docker stop "$CONTAINER" 2>/dev/null || true
docker rm   "$CONTAINER" 2>/dev/null || true

echo "[deploy] Iniciando: $IMAGE"
if [ -f "$ENV_FILE" ]; then
  docker run -d \
    --name            "$CONTAINER" \
    --restart         unless-stopped \
    -p                3000:3000 \
    --env-file        "$ENV_FILE" \
    -v /home/ec2-user/key:/home/ec2-user/key:ro \
    "$IMAGE"
else
  echo "[deploy] ADVERTENCIA: $ENV_FILE no existe; el contenedor arranca sin vars de entorno."
  docker run -d \
    --name            "$CONTAINER" \
    --restart         unless-stopped \
    -p                3000:3000 \
    -v /home/ec2-user/key:/home/ec2-user/key:ro \
    "$IMAGE"
fi

echo "[deploy] Limpiando imágenes antiguas..."
docker image prune -f

echo "[deploy] Listo."
DEPLOY_SCRIPT

chmod +x /home/ec2-user/deploy.sh
chown ec2-user:ec2-user /home/ec2-user/deploy.sh
