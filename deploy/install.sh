#!/usr/bin/env bash
set -euo pipefail

SELF_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
DIST="$(cd -- "$SELF_DIR/.." && pwd)/dist"
SNIPPET_SRC="$SELF_DIR/nginx/peakora-node.conf"
SNIPPET_DST="/etc/nginx/snippets/peakora-node.conf"

ROOT="/var/www/html"
INSTALL_SNIPPET=1

usage() {
  cat <<'USAGE'
Раскатка статики Peakora Network на ноду.

  install.sh [--root DIR] [--no-snippet]

    --root DIR     куда положить сайт (по умолчанию /var/www/html)
    --no-snippet   не трогать конфигурацию nginx
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    --root)       ROOT="${2:?--root требует путь}"; shift 2 ;;
    --no-snippet) INSTALL_SNIPPET=0; shift ;;
    -h|--help)    usage; exit 0 ;;
    *)            echo "неизвестный аргумент: $1" >&2; usage >&2; exit 2 ;;
  esac
done

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

  if nginx -t; then
    systemctl reload nginx
    echo "OK: nginx перезагружен"
  else
    echo "ОШИБКА: nginx -t не прошёл, откатываю фрагмент" >&2
    if [ -n "$BACKUP" ]; then
      mv "$BACKUP" "$SNIPPET_DST"
    else
      rm -f "$SNIPPET_DST"
    fi
    exit 1
  fi

  # Через `[ -n "$BACKUP" ] && rm -f ...` нельзя: при пустой переменной такой
  # список вернёт 1, и set -e уронит скрипт на последней строке успешной установки.
  if [ -n "$BACKUP" ]; then
    rm -f "$BACKUP"
  fi
fi

echo
echo "Готово. В server{} каждой ноды должна быть строка:"
echo "    include $SNIPPET_DST;"
