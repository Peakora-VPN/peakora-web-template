#!/usr/bin/env bash
set -euo pipefail

SELF_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
DIST="$(cd -- "$SELF_DIR/.." && pwd)/dist"
SNIPPET_SRC="$SELF_DIR/nginx/peakora-node.conf"
SNIPPET_DEFAULT="/etc/nginx/snippets/peakora-node.conf"

ROOT="/var/www/html"
SNIPPET_DST="$SNIPPET_DEFAULT"
INSTALL_SNIPPET=1
NGINX_CMD=""
DOCKER_NGINX=""

usage() {
  cat <<'USAGE'
Раскатка статики Peakora Network на ноду.

  install.sh [--root DIR] [--snippet-dst PATH] [--no-snippet] [--nginx CMD]

    --root DIR         куда положить сайт (по умолчанию /var/www/html)
    --snippet-dst PATH куда положить фрагмент nginx
                       (по умолчанию /etc/nginx/snippets/peakora-node.conf).
                       Если nginx в контейнере, укажите путь, который в него
                       проброшен, — иначе include внутри контейнера не найдёт файл.
    --no-snippet       не трогать конфигурацию nginx вообще
    --nginx CMD        чем звать nginx, если он не в PATH. Контейнер находится
                       сам; задать вручную: --nginx "docker exec remnawave-nginx nginx"
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    --root)         ROOT="${2:?--root требует путь}"; shift 2 ;;
    --snippet-dst)  SNIPPET_DST="${2:?--snippet-dst требует путь}"; shift 2 ;;
    --nginx)        NGINX_CMD="${2:?--nginx требует команду}"; shift 2 ;;
    --no-snippet)   INSTALL_SNIPPET=0; shift ;;
    -h|--help)      usage; exit 0 ;;
    *)              echo "неизвестный аргумент: $1" >&2; usage >&2; exit 2 ;;
  esac
done

# nginx может быть не в PATH: лежать в sbin либо крутиться в контейнере.
# Отсутствие ошибкой не считаем — проверить конфигурацию просто будет нечем.
find_nginx() {
  [ -n "$NGINX_CMD" ] && return 0

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

  if command -v docker >/dev/null 2>&1; then
    local found count
    found="$(docker ps --format '{{.Names}}	{{.Image}}' 2>/dev/null |
      awk -F'\t' '$2 ~ /(^|\/)nginx(:|$)/ || $1 ~ /nginx/ { print $1 }')"
    count="$(printf '%s\n' "$found" | grep -c . || true)"
    if [ "$count" = "1" ]; then
      DOCKER_NGINX="$(printf '%s\n' "$found" | head -1)"
      NGINX_CMD="docker exec $DOCKER_NGINX nginx"
      echo "-> nginx найден в контейнере $DOCKER_NGINX"
      return 0
    elif [ "$count" != "0" ]; then
      echo "-> контейнеров с nginx несколько, выберите нужный через --nginx" >&2
    fi
  fi

  return 1
}

# $NGINX_CMD намеренно без кавычек: он может быть многословным («docker exec … nginx»).
reload_nginx() {
  if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet nginx 2>/dev/null; then
    systemctl reload nginx
  else
    $NGINX_CMD -s reload
  fi
}

if [ ! -f "$DIST/index.html" ]; then
  echo "в $DIST нет index.html — соберите сайт: node build.mjs" >&2
  exit 1
fi

echo "-> статика в $ROOT"
mkdir -p "$ROOT"
cp -a "$DIST/." "$ROOT/"
find "$ROOT" -type d -exec chmod 755 {} +
find "$ROOT" -type f -exec chmod 644 {} +

if [ "$INSTALL_SNIPPET" -eq 1 ]; then
  echo "-> фрагмент nginx в $SNIPPET_DST"
  mkdir -p "$(dirname "$SNIPPET_DST")"

  BACKUP=""
  if [ -f "$SNIPPET_DST" ]; then
    BACKUP="$SNIPPET_DST.bak"
    cp -a "$SNIPPET_DST" "$BACKUP"
  fi
  install -m 644 "$SNIPPET_SRC" "$SNIPPET_DST"

  if find_nginx; then
    # У контейнера своя файловая система: фрагмент, положенный на хост, внутри
    # может не существовать, и тогда include уронит конфигурацию. Спрашиваем сам
    # контейнер, а не гадаем по путям.
    if [ -n "$DOCKER_NGINX" ] && ! docker exec "$DOCKER_NGINX" test -f "$SNIPPET_DST" 2>/dev/null; then
      echo >&2
      echo "ВНИМАНИЕ: контейнер $DOCKER_NGINX не видит $SNIPPET_DST." >&2
      echo "Строку include внутри него добавлять НЕЛЬЗЯ — nginx не запустится." >&2
      echo "Варианты:" >&2
      echo "  1. Пробросить фрагмент в контейнер, добавив в compose том:" >&2
      echo "       - $SNIPPET_DST:$SNIPPET_DEFAULT:ro" >&2
      echo "     и пересоздать контейнер: docker compose up -d" >&2
      echo "  2. Либо вписать содержимое фрагмента прямо в server{} своего" >&2
      echo "     nginx.conf — он смонтирован в контейнер и уже правится под ноду." >&2
      echo "     Исходник: $SNIPPET_SRC" >&2
    fi

    if $NGINX_CMD -t; then
      reload_nginx
      echo "OK: nginx перезагружен"
      if [ -n "$BACKUP" ]; then
        rm -f "$BACKUP"
      fi
    else
      # Откатываем, только если nginx сам сказал, что конфигурация сломана.
      echo "ОШИБКА: проверка конфигурации не прошла, откатываю фрагмент" >&2
      if [ -n "$BACKUP" ]; then
        mv "$BACKUP" "$SNIPPET_DST"
      else
        rm -f "$SNIPPET_DST"
      fi
      exit 1
    fi
  else
    # Фрагмент инертен, пока на него нет include в server{}, поэтому оставляем
    # его на месте: стирать проделанную работу из-за ненайденного бинарника незачем.
    if [ -n "$BACKUP" ]; then
      rm -f "$BACKUP"
    fi
    echo >&2
    echo "ВНИМАНИЕ: nginx не найден — конфигурация не проверена и не перезагружена." >&2
    echo "Фрагмент установлен и ждёт: сам по себе он ни на что не влияет," >&2
    echo "пока в server{} нет строки include." >&2
    echo "Укажите, чем звать nginx, и повторите:" >&2
    echo "    $0 --nginx \"docker exec <контейнер> nginx\"" >&2
  fi
fi

echo
echo "Готово. В server{} каждой ноды должна быть строка:"
echo "    include $SNIPPET_DEFAULT;"
echo "(путь — тот, по которому фрагмент виден самому nginx)"
