#!/bin/bash
# deploy.sh — se coloca en ~/ del usuario EC2 y lo llama GitHub Actions.
# Uso: ./deploy.sh <imagen> <nombre-contenedor> <puerto-host> <env-file>
set -euo pipefail

IMAGE="${1:?Argumento 1 requerido: imagen Docker}"
CONTAINER="${2:?Argumento 2 requerido: nombre del contenedor}"
HOST_PORT="${3:-3001}"
ENV_FILE="${4:-$HOME/.env.image-api}"

echo "▶ Pulling $IMAGE …"
docker pull "$IMAGE"

echo "▶ Stopping old container '$CONTAINER' (if running) …"
docker stop "$CONTAINER" 2>/dev/null || true
docker rm   "$CONTAINER" 2>/dev/null || true

echo "▶ Starting new container on port $HOST_PORT …"
docker run -d \
  --name "$CONTAINER" \
  --restart unless-stopped \
  --env-file "$ENV_FILE" \
  -p "${HOST_PORT}:3000" \
  --log-opt max-size=50m \
  --log-opt max-file=3 \
  "$IMAGE"

docker logout ghcr.io

echo "▶ Cleaning up dangling images …"
docker image prune -f

echo "✅  $CONTAINER desplegado correctamente en puerto $HOST_PORT"
docker ps --filter "name=$CONTAINER" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
