#!/usr/bin/env bash
set -euo pipefail

SELF_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "$SELF_DIR/.." && pwd)"
COMPOSE_FILE="$PROJECT_ROOT/compose.yaml"
SNIPPET_SRC="$SELF_DIR/nginx/peakora-node.conf"
SNIPPET_DEFAULT="/etc/nginx/snippets/peakora-node.conf"

SNIPPET_DST="$SNIPPET_DEFAULT"
INSTALL_SNIPPET=1
NGINX_CMD=""
DOCKER_NGINX=""
NGINX_AVAILABLE=1

usage() {
  cat <<'USAGE'
Установка и обновление FastAPI-сайта Peakora Network.

  install.sh [--snippet-dst PATH] [--no-snippet] [--nginx CMD]

    --snippet-dst PATH куда положить фрагмент nginx
                       (по умолчанию /etc/nginx/snippets/peakora-node.conf)
    --no-snippet       поднять backend, не менять конфигурацию nginx
    --nginx CMD        чем звать nginx, если он не в PATH
                       пример: --nginx "docker exec remnawave-nginx nginx"

Требуются установленные Docker и Compose v2 с запущенным daemon; скрипт их не устанавливает.
uv и Node на сервере не нужны: зависимости собираются внутри Docker image.
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    --snippet-dst)  SNIPPET_DST="${2:?--snippet-dst требует путь}"; shift 2 ;;
    --nginx)        NGINX_CMD="${2:?--nginx требует команду}"; shift 2 ;;
    --no-snippet)   INSTALL_SNIPPET=0; shift ;;
    -h|--help)      usage; exit 0 ;;
    *)              echo "неизвестный аргумент: $1" >&2; usage >&2; exit 2 ;;
  esac
done

if [ "$(uname -s)" != "Linux" ]; then
  echo "установщик рассчитан на Linux" >&2
  exit 1
fi
if [ "$(id -u)" != "0" ]; then
  echo "запустите установщик через sudo" >&2
  exit 1
fi

for required in "$COMPOSE_FILE" "$PROJECT_ROOT/Dockerfile" "$PROJECT_ROOT/pyproject.toml" "$PROJECT_ROOT/uv.lock" "$PROJECT_ROOT/app/main.py" "$SNIPPET_SRC"; do
  if [ ! -f "$required" ]; then
    echo "нет обязательного файла: $required" >&2
    exit 1
  fi
done

ensure_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "Docker не найден; установите Docker и повторите запуск" >&2
    exit 1
  fi
  if ! docker compose version >/dev/null 2>&1; then
    echo "Docker Compose v2 не найден; установите плагин и повторите запуск" >&2
    exit 1
  fi
  if ! docker info >/dev/null 2>&1; then
    echo "Docker daemon не запущен; запустите его и повторите установку" >&2
    exit 1
  fi
}

find_nginx() {
  if [ -n "$NGINX_CMD" ]; then
    if [[ "$NGINX_CMD" =~ ^docker[[:space:]]+exec[[:space:]]+([^[:space:]]+)[[:space:]]+nginx$ ]]; then
      DOCKER_NGINX="${BASH_REMATCH[1]}"
    fi
    return 0
  fi

  if command -v nginx >/dev/null 2>&1; then
    NGINX_CMD="nginx"
    return 0
  fi

  local candidate
  for candidate in /usr/sbin/nginx /usr/local/sbin/nginx /usr/local/nginx/sbin/nginx; do
    if [ -x "$candidate" ]; then
      NGINX_CMD="$candidate"
      return 0
    fi
  done

  local found count
  found="$(docker ps --format '{{.Names}}\t{{.Image}}' 2>/dev/null |
    awk -F'\t' '$2 ~ /(^|\/)nginx(:|$)/ || $1 ~ /nginx/ { print $1 }')"
  count="$(printf '%s\n' "$found" | grep -c . || true)"
  if [ "$count" = "1" ]; then
    DOCKER_NGINX="$(printf '%s\n' "$found" | head -1)"
    NGINX_CMD="docker exec $DOCKER_NGINX nginx"
    echo "-> nginx найден в контейнере $DOCKER_NGINX"
    return 0
  fi
  if [ "$count" != "0" ]; then
    echo "контейнеров с nginx несколько, выберите нужный через --nginx" >&2
  else
    echo "nginx не найден; snippet будет установлен без проверки и reload" >&2
  fi
  return 1
}

restore_snippet() {
  if [ -n "$BACKUP" ]; then
    mv "$BACKUP" "$SNIPPET_DST"
  else
    rm -f "$SNIPPET_DST"
  fi
}

ensure_docker

if [ "$INSTALL_SNIPPET" -eq 1 ]; then
  if ! find_nginx; then
    NGINX_AVAILABLE=0
  fi
  if [ -n "$DOCKER_NGINX" ]; then
    network_mode="$(docker inspect --format '{{.HostConfig.NetworkMode}}' "$DOCKER_NGINX")"
    if [ "$network_mode" != "host" ]; then
      echo "контейнер $DOCKER_NGINX использует сеть $network_mode, а нужна host для 127.0.0.1:8000" >&2
      exit 1
    fi
  fi
fi

echo "-> сборка FastAPI image"
docker compose -p peakora-web -f "$COMPOSE_FILE" build

if ! docker compose -p peakora-web -f "$COMPOSE_FILE" up -d --wait --wait-timeout 120; then
  docker compose -p peakora-web -f "$COMPOSE_FILE" logs --tail 100 || true
  exit 1
fi

health=""
for ((attempt = 0; attempt < 30; attempt++)); do
  health="$(docker inspect --format '{{.State.Health.Status}}' peakora-web 2>/dev/null || true)"
  [ "$health" = "healthy" ] && break
  [ "$health" = "unhealthy" ] && break
  sleep 2
done
if [ "$health" != "healthy" ]; then
  echo "backend не стал healthy (текущий статус: ${health:-unknown})" >&2
  docker compose -p peakora-web -f "$COMPOSE_FILE" logs --tail 100 || true
  exit 1
fi
echo "-> backend healthy на 127.0.0.1:8000"

if [ "$INSTALL_SNIPPET" -eq 1 ]; then
  mkdir -p "$(dirname "$SNIPPET_DST")"
  BACKUP=""
  if [ -f "$SNIPPET_DST" ]; then
    BACKUP="$SNIPPET_DST.bak"
    cp -a "$SNIPPET_DST" "$BACKUP"
  fi
  install -m 644 "$SNIPPET_SRC" "$SNIPPET_DST"

  if [ "$NGINX_AVAILABLE" -eq 1 ]; then
    if [ -n "$DOCKER_NGINX" ] && ! docker exec "$DOCKER_NGINX" test -f "$SNIPPET_DST" 2>/dev/null; then
      echo "контейнер $DOCKER_NGINX не видит $SNIPPET_DST; пробросьте файл до запуска установщика" >&2
      restore_snippet
      exit 1
    fi

    if ! $NGINX_CMD -t; then
      echo "nginx -t не прошёл, прежний фрагмент восстановлен" >&2
      restore_snippet
      exit 1
    fi
    if ! $NGINX_CMD -s reload; then
      echo "nginx не перезагрузился, прежний фрагмент восстановлен" >&2
      restore_snippet
      exit 1
    fi
    echo "-> nginx проверен и перезагружен"
  fi
  if [ -n "$BACKUP" ]; then
    rm -f "$BACKUP"
  fi
  echo "-> nginx проверен и перезагружен"
fi

echo "Готово: FastAPI работает на 127.0.0.1:8000, healthcheck /healthz"
