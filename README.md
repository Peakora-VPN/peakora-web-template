# peakora-web-template

Публичный сайт Peakora Network на FastAPI. Сервер рендерит Jinja2-шаблоны,
nginx проксирует к нему обычный веб-трафик, а специальные маршруты Remnawave
продолжают обслуживать свои upstreams. Один образ работает на всех нодах без
конфигурации страны: региональная подпись вычисляется в браузере из hostname.

Сайт содержит законченный технический справочник, а не имитацию метрик: реальные
Navigation Timing текущей загрузки, связные статьи, локальные шрифты, рабочий
email и отдельную 404. Список узлов, клиенты, ASN, uptime и другие непроверяемые
сведения не публикуются.

## Маршруты

| Адрес | Содержимое |
|---|---|
| `/` | Обзор инфраструктуры, путь запроса, измерения, Field notes, FAQ и контакт |
| `/network/` | Справочник DNS, соединений, TLS, HTTP и измерений |
| `/articles/` | Каталог Field notes |
| `/articles/name-resolution/` | Name resolution и кэширование |
| `/articles/connection-reuse/` | Secure transport и connection reuse |
| `/articles/reading-timings/` | Navigation Timing, TTFB и передача |
| `/healthz` | Минимальный healthcheck `{"status":"ok"}` |
| любой другой HTML-путь | Общая страница с настоящим HTTP 404 |

`/docs`, `/redoc` и `/openapi.json` отключены. CSS, JS, шрифты и иконки отдаются
локально из `/assets/` и корневых маршрутов. Внешних запросов со страницы нет.

## Разработка

Нужны Python 3.15 и [uv](https://docs.astral.sh/uv/). Node ≥ 20 нужен только
для браузерно-логических и конфигурационных тестов; `node_modules` не появляется.

```bash
uv sync
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Проверки:

```bash
uv run pytest -q       # ASGI routes, ответы, ссылки, содержимое
node --test            # browser logic, markup, fonts, Docker, nginx, installer
bash -n deploy/install.sh
docker compose config --quiet
```

Не используйте `node --test tests/`: на новых Node позиционный аргумент
трактуется как модуль, а не каталог. Нужен голый `node --test`.

Обновление зависимостей и проверка актуальности:

```bash
uv lock --upgrade
uv sync --upgrade
uv pip list --outdated
```

Точные версии зафиксированы в `uv.lock`; Docker устанавливает их через
`uv sync --locked --no-dev`.

## Docker

```bash
docker compose up -d --build --wait
curl -i http://127.0.0.1:8000/
curl http://127.0.0.1:8000/healthz
docker compose logs -f
```

Backend слушает только `127.0.0.1:8000` на хосте. Контейнер работает от UID
10001 с read-only root filesystem, без capabilities и с ротацией логов.
Остановка: `docker compose down`.

## Установка и обновление ноды

Требуются Linux, установленные Docker и Compose v2 и запущенный Docker daemon.
Скрипт Docker и daemon не устанавливает и не настраивает. Если контейнер сайта
отсутствует или остановлен, Compose создаст и поднимет его, затем установщик
дождётся healthy. uv и Node не устанавливаются. Snippet устанавливается всегда,
кроме режима `--no-snippet`. Если nginx не найден, пропускаются только его
проверка и reload, а backend продолжает устанавливаться.

```bash
git clone <repo> /opt/peakora-web-template
cd /opt/peakora-web-template
sudo deploy/install.sh
```

Последующие обновления:

```bash
git pull
sudo deploy/install.sh
```

Перед `nginx -s reload` установщик проверяет healthcheck и `nginx -t`. При
ошибке конфигурации прежний snippet восстанавливается. `/var/www/html` и права
на посторонние файлы больше не изменяются.

Флаги:

- `--snippet-dst PATH` — другой путь фрагмента;
- `--no-snippet` — поднять только backend;
- `--nginx "docker exec remnawave-nginx nginx"` — явно выбрать nginx.

### Подключение nginx

`deploy/nginx/server.example.conf` содержит sanitized полный пример для
`sulfur.peakora.cc`. Оба специальных location сохранены:

- `^~ /api/v1/network/connection-lifecycle/` → `127.0.0.1:8444`;
- `^~ /api/v1/network/edge-routing/` → `127.0.0.1:8445`.

Не переносите их в FastAPI и не добавляйте общий `location /api/`. Блок
`include /etc/nginx/snippets/peakora-node.conf;` стоит после них; приоритет
`^~` исключает перехват Xray/XHTTP обычным `location /`.

Фрагмент проксирует web на `127.0.0.1:8000`. Если nginx в контейнере, он должен
использовать `network_mode: host` — установщик проверяет это. Это согласуется
с его текущими обращениями к Xray на `127.0.0.1:8444/8445`.

Если фрагмент ещё не смонтирован в nginx-контейнер, добавьте рядом с монтированием
основного `nginx.conf`:

```yaml
- /etc/nginx/snippets/peakora-node.conf:/etc/nginx/snippets/peakora-node.conf:ro
```

Файл должен существовать до пересоздания контейнера. Затем добавьте `include`
в server-блок по `server.example.conf` и повторите установщик. Изменять JSON
Remnanode или пересоздавать его контейнеры скрипт не пытается.

Дополнительно включены gzip для текста, `server_tokens off`, HSTS без preload и
без `includeSubDomains`, `nosniff`, `no-referrer`, CSP без inline, `noindex` и
корректные forwarded headers. Ассеты кэшируются на час, HTML требует revalidation.

## Как устроен репозиторий

```
app/main.py          FastAPI routes, metadata, TemplateResponse и 404
src/layout.html      базовый Jinja2 layout
src/pages/*.html     дочерние Jinja2-шаблоны страниц
src/site.json        контактный адрес — единственный источник
src/assets/          публичные CSS, JS, шрифты и иконки
pyproject.toml       Python 3.15 и зависимости
uv.lock              зафиксированные актуальные версии
Dockerfile           uv sync и запуск Uvicorn от UID 10001
compose.yaml         loopback-only backend и healthcheck
deploy/install.sh    проверка Docker, запуск сайта, nginx -t и rollback
deploy/nginx/        FastAPI snippet и полный sanitized server example
tests/               Python ASGI-тесты и Node/browser/config-тесты
tools/               разовые скрипты, например обновление шрифтов
```

Добавление страницы требует дочернего шаблона и явного маршрута в `app/main.py`.
Title, description, OG type, active nav, год и контакт подставляет сервер.
Старые `build.mjs` и `dist` не используются.

## Браузерное поведение

Регион определяется через `Intl.DisplayNames` без таблицы локаций. Поддерживаются
`pl`, `pl2`, `pl-2`, `edge-pl-2`, `de-fra-01` и вложенные метки. Это обозначение
в имени, не подтверждённая геолокация. Hostname и список других нод не выводятся.

`src/assets/app.js` подключает вкладки с клавиатурой, копирование email и реальные
Navigation Timing. Контент читается без JS; нулевые фазы не выдумываются. Контакт
остаётся `mailto:` на адрес из `src/site.json` — форм, cookie, localStorage и
аналитики нет. Ящик `abuse@peakora.network` должен реально принимать почту.

## Инварианты

- Ноль внешних запросов со страницы; шрифты локальные.
- Ни inline `<script>`, ни атрибутов `style=`; CSP остаётся self-only.
- Список локаций и непроверяемые факты не публикуются.
- `noindex, nofollow` и `Disallow: /` сохраняются против дублей нод.
- Нет аналитики, cookie, хранилища, форм или отправки данных со страницы.
- Оба Xray location и их gRPC upstreams не изменяются.
- Backend не публикуется на внешнем интерфейсе, только на loopback.
- Security headers дублируются в каждом web `location`, потому что собственный
  `add_header` отменяет наследование nginx.
