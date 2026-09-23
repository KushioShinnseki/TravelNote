#!/usr/bin/env bash
set -Eeuo pipefail

DEPLOY_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$(cd -- "$DEPLOY_DIR/.." && pwd)"
PROJECT_NAME="${TRAVELNOTE_COMPOSE_PROJECT:-travelnote}"
COMPOSE_FILE="${TRAVELNOTE_COMPOSE_FILE:-$PACKAGE_DIR/docker-compose.yml}"
ENV_FILE="${TRAVELNOTE_ENV_FILE:-$PACKAGE_DIR/.env}"

if ! command -v docker >/dev/null 2>&1; then
  echo "未找到 docker，请先安装 Docker Engine。" >&2
  exit 1
fi

if [[ -f "$COMPOSE_FILE" && -f "$ENV_FILE" ]] && docker compose version >/dev/null 2>&1; then
  compose=(docker compose
    --project-name "$PROJECT_NAME"
    --project-directory "$PACKAGE_DIR"
    --file "$COMPOSE_FILE"
    --env-file "$ENV_FILE")
  echo "停止 TravelNote Compose 项目：$PROJECT_NAME"
  "${compose[@]}" down --remove-orphans
  echo "TravelNote 容器已停止；数据库 volume 未删除。"
  exit 0
fi

# 没有 .env 时不能让 Compose 完成变量插值，改用 Compose label 精确清理
# 当前项目的容器和网络，不触碰其他 Compose 项目或 Docker 服务。
mapfile -t container_ids < <(docker ps -aq --filter "label=com.docker.compose.project=$PROJECT_NAME")
if ((${#container_ids[@]} > 0)); then
  docker rm --force "${container_ids[@]}"
fi
mapfile -t network_ids < <(docker network ls -q --filter "label=com.docker.compose.project=$PROJECT_NAME")
if ((${#network_ids[@]} > 0)); then
  docker network rm "${network_ids[@]}" >/dev/null 2>&1 || true
fi
echo "已按项目标签停止 TravelNote：$PROJECT_NAME；数据库 volume 未删除。"
