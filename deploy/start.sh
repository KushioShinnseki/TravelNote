#!/usr/bin/env bash
set -Eeuo pipefail

DEPLOY_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$(cd -- "$DEPLOY_DIR/.." && pwd)"
PROJECT_NAME="${TRAVELNOTE_COMPOSE_PROJECT:-travelnote}"
COMPOSE_FILE="${TRAVELNOTE_COMPOSE_FILE:-$PACKAGE_DIR/docker-compose.yml}"
ENV_FILE="${TRAVELNOTE_ENV_FILE:-$PACKAGE_DIR/.env}"

if ! command -v docker >/dev/null 2>&1; then
  echo "未找到 docker，请先安装 Docker Engine 和 Docker Compose plugin。" >&2
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "未找到 docker compose plugin，请先安装 Docker Compose plugin。" >&2
  exit 1
fi
if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "未找到 Docker Compose 文件：$COMPOSE_FILE" >&2
  exit 1
fi
if [[ ! -f "$ENV_FILE" ]]; then
  echo "未找到环境文件：$ENV_FILE" >&2
  echo "请先执行：cp .env.example .env，并填写真实密码和 JWT_SECRET。" >&2
  exit 1
fi

compose=(docker compose
  --project-name "$PROJECT_NAME"
  --project-directory "$PACKAGE_DIR"
  --file "$COMPOSE_FILE"
  --env-file "$ENV_FILE")

echo "在服务器本地构建并启动 TravelNote Compose 项目：$PROJECT_NAME"
"${compose[@]}" up --detach --build --remove-orphans travelnote-web
"${compose[@]}" ps
