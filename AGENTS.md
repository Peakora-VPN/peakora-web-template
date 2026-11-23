# AGENTS.md

Инструкции для Codex при работе с этим репозиторием.

## Обзор проекта

**peakora-web-template — сайт Peakora Network на FastAPI.** Jinja2-страницы
рендерит backend, существующий Remnawave nginx проксирует к нему обычный трафик.
Один Docker image работает на всех нодах; страна определяется браузером из
`location.hostname`, конфигурация страны на сервере не нужна.

Python — 3.15, зависимости фиксируются uv в `uv.lock`. Node ≥ 20 нужен только
для browser/config-тестов, `node_modules` не появляется. На сервере нет ни Node,
ни uv: зависимости устанавливаются внутри Docker build.

```
app/main.py        явные routes, метаданные, healthcheck, 404
src/layout.html    базовый Jinja2 layout
src/pages/*.html   дочерние шаблоны всех страниц
src/site.json      контакт — единственный источник
src/assets/        публичные CSS, JS, шрифты, иконки
pyproject.toml     Python 3.15 и зависимости
uv.lock            воспроизводимые версии
Dockerfile         uv sync --locked и Uvicorn от UID 10001
compose.yaml       loopback-only service и healthcheck
deploy/            nginx fragment/example и install.sh
tools/             разовые скрипты, в runtime не участвуют
```

## Команды

```bash
uv sync
uv run pytest -q
node --test
docker compose config --quiet
docker compose up -d --build --wait
```

Локально: `uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000`.
`node --test tests/` не работает на новых Node; нужен голый `node --test`.
Актуализация пакетов: `uv lock --upgrade && uv sync --upgrade`, проверка —
`uv pip list --outdated`. Перед Docker build всегда оставлять свежий `uv.lock`.

## Routes и шаблоны

Явные HTML routes: `/`, `/network/`, `/articles/` и три статьи
`name-resolution`, `connection-reuse`, `reading-timings`. Также есть
`/healthz`, root icons, `/robots.txt` и `/assets/*`. Неизвестный путь получает
общую 404 со статусом 404. GET и HEAD объявляются явно; остальные методы — 405.
Trailing slash redirects должны сохранять HTTPS за nginx.

`/docs`, `/redoc`, `/openapi.json` отключены. FastAPI не содержит handlers для
Remnawave API. Приватные исходники и `src/site.json` не монтируются в StaticFiles.

`src/layout.html` использует `{{ title }}`, `{{ description }}`, `{{ og_type }}`,
`{{ year }}`, `{{ contact }}` и `{% block content %}`. Дочерние шаблоны начинаются
с `{% extends "layout.html" %}`; метаданные передаёт `render_page` из `app/main.py`.
Добавление страницы требует шаблона и явного route, автогенерации нет. Логотип
подключается серверным `{% include "assets/logo.svg" %}`.

Старых `build.mjs` и `dist/` нет. Браузер получает те же ES-модули
`src/assets/app.js` и `src/assets/lib.js`, которые Node импортирует в тестах.

## Как страница узнаёт страну

`Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' })` одновременно
даёт название и проверяет код, таблица ISO не нужна. Псевдорегионы `ZZ`, `QO`,
`XA`, `XB`, `EU`, `EZ`, `UN` отсекаются. Поддерживаются `pl`, `pl2`, `pl-2`,
`edge-pl-2`, `de-fra-01` и вложенные метки `edge.pl2`; конфликт даёт нейтральную
подпись. Для составных зон учтены только распространённые
`ac/co/com/edu/gov/net/org` перед двухбуквенной зоной, не полная Public Suffix List.

Регион — обозначение в имени, не проверенная физическая геолокация. Hostname,
заголовок страницы и список нод не меняются и не раскрываются. Нейтральный
«Edge node» остаётся рабочим без JS.

## Измерения и интерактивность

Navigation Timing показывает реальные DNS/TCP/TLS/TTFB/transfer одной загрузки.
Нулевые фазы отбрасываются. `phaseWidths` имеет пол 8 %, CSS custom properties
записываются через CSSOM без `style=` в разметке. Ничего наружу не отправляется.

`wireTabs` управляет ARIA, стрелками и Home/End; до JS кнопки скрыты, все панели
читаемы. Остальное — native `<details>`. Контакт — только `mailto:` на
`src/site.json` и копирование `wireCopyButtons`, без формы и отправки данных.

Цвета: бирюзовый `--accent` только для реальных измерений, `--accent-2` для
структуры и ссылок. Сохранять тёмную тему, английский текст, локальные шрифты,
responsive layout, focus-visible и `prefers-reduced-motion`.

## Docker и установка

`deploy/install.sh` запускается от root на Linux и требует установленные
Docker и Compose v2 с запущенным daemon. Docker и daemon скрипт не устанавливает
и не настраивает. Compose создаёт или поднимает контейнер сайта, затем скрипт
ждёт healthy. Далее копирует snippet с backup, делает `nginx -t` и reload; при
ошибке snippet откатывается. `/var/www/html`, старые файлы и чужие права не трогает.

Compose публикует только `127.0.0.1:8000:8000`. Контейнер nginx должен иметь
`network_mode: host`: его loopback тогда совпадает с host-loopback, как и для
текущих Xray upstreams. Snippet должен быть смонтирован внутрь контейнера.
Установщик проверяет оба условия и не пересоздаёт Remnanode/Xray.

Обновление: `git pull && sudo deploy/install.sh`.

## nginx и Xray

`deploy/nginx/server.example.conf` — sanitized полный server example для
`sulfur.peakora.cc`. Неизменные специальные маршруты:

- `location ^~ /api/v1/network/connection-lifecycle/` → `grpc://127.0.0.1:8444`;
- `location ^~ /api/v1/network/edge-routing/` → `grpc://127.0.0.1:8445`.

Их timeout/buffer/header/gzip/log настройки не меняются, include идёт после них.
Во фрагменте нет общего `/api/` или regex locations. Web `/` и `/assets/`
проксируются на `127.0.0.1:8000`. HTML — no-cache, нехэшированные ассеты —
`max-age=3600`, не immutable. gzip включён для web, специальные блоки сохраняют
`gzip off`. HSTS без `includeSubDomains` и preload.

Секреты REALITY, short IDs, clients и Xray JSON в репозиторий не копировать.

## Инварианты

- **Ноль внешних запросов со страницы.** Шрифты локальные. Стережёт
  `tests/test_content.py`.
- **Ни inline `<script>`, ни `style=`.** CSP self-only. Стережёт
  `tests/markup.test.mjs`.
- **Список локаций не публикуется.** Только браузерный `Intl.DisplayNames`.
- **Никаких выдуманных фактов:** ASN, PeeringDB, юрлица, адреса, клиенты,
  uptime и неизмеренные метрики запрещены.
- **Ничего не запоминается и никуда не отчитывается:** ни cookie, storage,
  аналитики, fetch или форм. Контакт только mailto.
- **`noindex, nofollow` и `Disallow: /` сохраняются** против дублей одинаковых нод.
- **Backend только на loopback**, стандартная API-документация выключена.
- **Оба Xray location и upstreams неизменны.** Стережёт `tests/nginx.test.mjs`.
- **Security headers дублируются в каждом web location:** первый `add_header`
  в location отменяет наследование server в nginx.

## Шрифты

Только latin; диакритика и типографский апостроф покрыты текущим unicode-range.
Inter вариативный для 400/500, Space Grotesk 600, JetBrains Mono 500. OFL лежит
рядом. `tests/fonts.test.mjs` проверяет строки страниц и английские регионы ICU.
После ручного `node tools/fetch-fonts.mjs > faces.tmp.css` блок вставляется в
`src/assets/styles.css`; временный файл удаляется.

## Изменение текстов

Тексты английские, тема тёмная. Контакт — поле `contact` в `src/site.json`, в
шаблонах `{{ contact }}`. Ящик обязан реально принимать почту. Исторические specs
в `docs/superpowers/` не переписываются; актуальная архитектура описана здесь и
в README.
