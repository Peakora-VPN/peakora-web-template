# Сайт-заглушка для нод — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** статический сайт «Peakora Network — edge-инфраструктура», который nginx отдаёт на домене любой ноды; один артефакт на все локации, страна узла определяется из hostname.

**Architecture:** два ES-модуля (`src/lib.js` — чистая логика, `src/app.js` — привязка к DOM), рукописные HTML и CSS, сборщик `build.mjs` на стандартной библиотеке Node хэширует ассеты и подставляет имена. Тесты Node импортируют ровно те же модули, что грузит браузер, — бандлера нет.

**Tech Stack:** HTML, CSS, ES-модули, Node ≥ 20 (только для сборки и тестов), `node:test`, nginx, bash.

**Spec:** `docs/superpowers/specs/2026-08-26-node-decoy-site-design.md`

## Global Constraints

Эти требования действуют в каждой задаче.

- **Ноль зависимостей.** Ни `dependencies`, ни `devDependencies`, ни `node_modules`. Только стандартная библиотека Node ≥ 20.
- **Ноль внешних запросов** из собранной страницы. Единственные разрешённые вхождения `http` в `dist` — неймспейсы `http://www.w3.org/2000/svg` и `http://www.w3.org/1999/xlink`.
- **Запрещённые слова** в `dist` (регистронезависимо, включая подстроки): `vpn`, `proxy`, `xray`, `reality`, `remnawave`, `marzban`, `shadowsocks`, `vless`, `trojan`.
- **Никаких проверяемо-ложных фактов** в текстах: ни номера автономной системы, ни PeeringDB, ни юрлица, ни адресов, ни числовых метрик, ни дат основания.
- **Ни одного инлайнового `<script>`, ни одного атрибута `style=`** — страница обязана работать под `Content-Security-Policy: default-src 'self'`.
- Язык — только английский. Тема — только тёмная.
- **Бюджет:** `dist/index.html` ≤ 30 KB, шрифты суммарно ≤ 100 KB, весь `dist` ≤ 250 KB.
- Все текстовые файлы в репозитории — с окончаниями строк LF.
- Токены оформления берутся из `peakora-cabinet/frontend/src/styles/tokens.css`: `--bg: #070b16`, `--bg-2: #0b1224`, `--text: #eaf0ff`, `--text-dim: #93a0c2`, `--accent: #37e0c9`, `--accent-2: #6a8bff`, радиусы `26/18/12 px`.

---

### Task 1: Каркас репозитория и определение страны

Первая задача создаёт обвязку и сразу же ядро логики — функцию, которая по hostname узла выдаёт страну. Всё остальное на неё опирается.

**Files:**
- Create: `.gitattributes`
- Create: `package.json`
- Create: `src/lib.js`
- Test: `tests/country.test.mjs`

**Interfaces:**
- Consumes: ничего.
- Produces: модуль `src/lib.js` с именованными экспортами
  - `SITE_NAME: string` — `'Peakora Network'`
  - `CONTACT_EMAIL: string` — `'abuse@peakora.network'`
  - `DEFAULT_ROLE: string` — `'Edge node'`
  - `regionName(code: string): string | null`
  - `countryFromHostname(hostname: unknown): { code: string, name: string } | null`
  - `flagFromCode(code: string): string`
  - `nodeLabel(country: object | null): string`
  - `pageTitle(country: object | null): string`

- [ ] **Step 1: Создать `.gitattributes`**

Репозиторий ведётся на Windows, а `install.sh` и фрагмент nginx едут на Linux. Без этого файла git запишет CRLF, и `install.sh` на ноде умрёт с `bad interpreter: /bin/bash^M`.

```
* text=auto eol=lf
*.woff2 -text
*.png   -text
*.ico   -text
```

- [ ] **Step 2: Создать `package.json`**

`"type": "module"` обязателен: без него Node считает `src/lib.js` файлом CommonJS, и `import` из теста упадёт.

```json
{
  "name": "peakora-web-template",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "description": "Static site served by nginx on Peakora Network edge hosts",
  "scripts": {
    "build": "node build.mjs",
    "test": "node --test"
  }
}
```

- [ ] **Step 3: Написать падающий тест**

Файл `tests/country.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  countryFromHostname,
  flagFromCode,
  nodeLabel,
  pageTitle,
  regionName,
} from '../src/lib.js';

test('разворачивает код страны из первой метки хоста', () => {
  assert.deepEqual(countryFromHostname('pl.peakora.network'), { code: 'PL', name: 'Poland' });
  assert.deepEqual(countryFromHostname('DE.Peakora.Network'), { code: 'DE', name: 'Germany' });
});

test('не выдумывает страну там, где её нет', () => {
  const hosts = [
    'philipp.peakora.network', // метка не является кодом страны
    'xq.peakora.network',      // по форме валиден, но ICU его не знает
    'zz.peakora.network',      // псевдорегион «Unknown Region»
    'qo.peakora.network',      // псевдорегион «Outlying Oceania»
    'peakora.network',         // меток меньше трёх — это апекс, а не узел
    'localhost',
    '',
  ];
  for (const host of hosts) {
    assert.equal(countryFromHostname(host), null, host);
  }
});

test('переживает мусор на входе', () => {
  for (const junk of [undefined, null, 42, {}, []]) {
    assert.equal(countryFromHostname(junk), null);
  }
});

test('regionName отсеивает псевдорегионы, но пропускает страны', () => {
  assert.equal(regionName('ZZ'), null);
  assert.equal(regionName('QO'), null);
  assert.equal(regionName('pl'), 'Poland');
  assert.equal(regionName('x'), null);
  assert.equal(regionName(undefined), null);
});

test('флаг собирается из regional indicator symbols', () => {
  assert.equal(flagFromCode('pl'), '\u{1F1F5}\u{1F1F1}');
  assert.equal(flagFromCode('x'), '');
  assert.equal(flagFromCode(undefined), '');
});

test('подписи деградируют до нейтральных', () => {
  const pl = { code: 'PL', name: 'Poland' };
  assert.equal(nodeLabel(pl), 'Poland · Edge node');
  assert.equal(nodeLabel(null), 'Edge node');
  assert.equal(pageTitle(pl), 'Poland — Peakora Network');
  assert.equal(pageTitle(null), 'Peakora Network — Edge infrastructure');
});
```

- [ ] **Step 4: Убедиться, что тест падает**

Run: `node --test tests/country.test.mjs`
Expected: FAIL — `Cannot find module .../src/lib.js`

- [ ] **Step 5: Написать `src/lib.js`**

```js
// Чистая логика страницы. Ни одного обращения к DOM: этот модуль импортируют
// и браузер, и тесты Node.

export const SITE_NAME = 'Peakora Network';
export const CONTACT_EMAIL = 'abuse@peakora.network';
export const DEFAULT_ROLE = 'Edge node';

// ICU резолвит эти коды, но странами они не являются.
const NOT_A_COUNTRY = new Set(['ZZ', 'QO', 'XA', 'XB']);

// fallback: 'none' заставляет .of() вернуть undefined для неизвестного кода —
// это и есть проверка валидности, поэтому таблицу ISO везти не нужно.
let displayNames;
try {
  displayNames = new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' });
} catch {
  displayNames = null;
}

export function regionName(code) {
  if (typeof code !== 'string' || !/^[a-z]{2}$/i.test(code)) return null;
  const cc = code.toUpperCase();
  if (NOT_A_COUNTRY.has(cc) || !displayNames) return null;
  try {
    return displayNames.of(cc) || null;
  } catch {
    return null;
  }
}

export function countryFromHostname(hostname) {
  if (typeof hostname !== 'string') return null;
  const labels = hostname.trim().toLowerCase().split('.');
  // Узлу нужно минимум <метка>.<домен>.<зона>; апекс сам по себе узлом не является.
  if (labels.length < 3) return null;
  const name = regionName(labels[0]);
  return name ? { code: labels[0].toUpperCase(), name } : null;
}

export function flagFromCode(code) {
  if (typeof code !== 'string' || !/^[a-z]{2}$/i.test(code)) return '';
  return String.fromCodePoint(
    ...[...code.toUpperCase()].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65),
  );
}

export function nodeLabel(country) {
  return country ? `${country.name} · ${DEFAULT_ROLE}` : DEFAULT_ROLE;
}

export function pageTitle(country) {
  return country ? `${country.name} — ${SITE_NAME}` : `${SITE_NAME} — Edge infrastructure`;
}
```

- [ ] **Step 6: Убедиться, что тесты проходят**

Run: `node --test tests/country.test.mjs`
Expected: PASS, 6 тестов

- [ ] **Step 7: Коммит**

```bash
git add .gitattributes package.json src/lib.js tests/country.test.mjs
git commit -m "feat: определение страны узла по hostname"
```

---

### Task 2: Разметка и стили

**Files:**
- Create: `src/index.html`
- Create: `src/styles.css`
- Create: `src/assets/logo.svg`
- Test: `tests/markup.test.mjs`

**Interfaces:**
- Consumes: значения из `src/lib.js` продублированы в разметке как значения по умолчанию (`Edge node`, `abuse@peakora.network`) — скрипт их только уточняет.
- Produces: элементы с `id`, на которые опирается Task 3: `node-label`, `node-flag`, `year`. Плейсхолдеры для сборки: `<!--LOGO-->`, `{{YEAR}}`, ссылки `/assets/styles.css` и `/assets/app.js`.

- [ ] **Step 1: Написать падающий тест**

Файл `tests/markup.test.mjs`. Он проверяет исходную разметку — до сборки.

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const read = (name) => readFileSync(SRC + name, 'utf8');

const FORBIDDEN = [
  'vpn', 'proxy', 'xray', 'reality', 'remnawave',
  'marzban', 'shadowsocks', 'vless', 'trojan',
];

test('index.html объявляет обязательные метаданные', () => {
  const html = read('index.html');
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<meta charset="utf-8"/);
  assert.match(html, /<meta name="viewport"/);
  assert.match(html, /<meta name="description" content=".+"/);
  assert.match(html, /<meta name="robots" content="noindex, nofollow"/);
  assert.match(html, /<title>.+<\/title>/);
  assert.doesNotMatch(html, /<meta name="generator"/);
});

test('index.html содержит якоря и точки привязки скрипта', () => {
  const html = read('index.html');
  for (const id of ['network', 'infrastructure', 'contact', 'node-label', 'node-flag', 'year']) {
    assert.ok(html.includes(`id="${id}"`), `нет id="${id}"`);
  }
  assert.ok(html.includes('<!--LOGO-->'), 'нет плейсхолдера логотипа');
  assert.ok(html.includes('{{YEAR}}'), 'нет плейсхолдера года');
});

test('разметка совместима с CSP: нет инлайнового скрипта и style=', () => {
  for (const name of ['index.html']) {
    const html = read(name);
    assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/i, `${name}: инлайновый <script>`);
    assert.doesNotMatch(html, /\sstyle="/i, `${name}: атрибут style=`);
  }
});

test('в исходниках нет запрещённых слов', () => {
  for (const name of ['index.html', 'styles.css', 'assets/logo.svg']) {
    const text = read(name).toLowerCase();
    for (const word of FORBIDDEN) {
      assert.ok(!text.includes(word), `${name} содержит «${word}»`);
    }
  }
});

test('стили определяют тёмную палитру и гасят анимацию по запросу', () => {
  const css = read('styles.css');
  assert.match(css, /--bg:\s*#070b16/);
  assert.match(css, /--accent:\s*#37e0c9/);
  assert.match(css, /prefers-reduced-motion/);
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `node --test tests/markup.test.mjs`
Expected: FAIL — `ENOENT: no such file or directory ... src/index.html`

- [ ] **Step 3: Создать `src/assets/logo.svg`**

Контур взят из `peakora-cabinet/frontend/public/favicon.svg`, но заливка задана презентационным атрибутом `fill`, а не `style=` — иначе инлайн в HTML нарушит CSP.

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 46" width="24" height="23" fill="none" role="img" aria-label="Peakora Network"><path fill="currentColor" d="M25.946 44.938c-.664.845-2.021.375-2.021-.698V33.937a2.26 2.26 0 0 0-2.262-2.262H10.287c-.92 0-1.456-1.04-.92-1.788l7.48-10.471c1.07-1.497 0-3.578-1.842-3.578H1.237c-.92 0-1.456-1.04-.92-1.788L10.013.474c.214-.297.556-.474.92-.474h28.894c.92 0 1.456 1.04.92 1.788l-7.48 10.471c-1.07 1.498 0 3.579 1.842 3.579h11.377c.943 0 1.473 1.088.89 1.83L25.947 44.94z"/></svg>
```

- [ ] **Step 4: Создать `src/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />

    <title>Peakora Network — Edge infrastructure</title>
    <meta name="description" content="Peakora Network operates distributed edge infrastructure. This host serves one of its locations." />
    <meta name="application-name" content="Peakora Network" />
    <meta name="robots" content="noindex, nofollow" />
    <meta name="color-scheme" content="dark" />
    <meta name="theme-color" content="#070b16" />

    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Peakora Network" />
    <meta property="og:title" content="Peakora Network — Edge infrastructure" />
    <meta property="og:description" content="Peakora Network operates distributed edge infrastructure. This host serves one of its locations." />
    <meta property="og:locale" content="en_US" />

    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="alternate icon" type="image/png" href="/favicon.png" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <link rel="stylesheet" href="/assets/styles.css" />
    <script type="module" src="/assets/app.js"></script>
  </head>
  <body>
    <div class="aurora" aria-hidden="true"><span class="b1"></span><span class="b2"></span><span class="b3"></span></div>

    <header class="site-head">
      <a class="brand" href="/">
        <!--LOGO-->
        <span>Peakora <b>Network</b></span>
      </a>
      <nav aria-label="Sections">
        <a href="#network">Network</a>
        <a href="#infrastructure">Infrastructure</a>
        <a href="#contact">Contact</a>
      </nav>
    </header>

    <main>
      <section class="hero" id="network">
        <p class="eyebrow">Edge network</p>
        <h1>Infrastructure that sits close to the traffic it carries</h1>
        <p class="lede">Peakora Network runs a distributed footprint of edge locations and moves traffic across it. This host is one of those locations.</p>

        <div class="panel node">
          <p class="node-head"><span class="dot" aria-hidden="true"></span>Operational</p>
          <p class="node-name"><span class="flag" id="node-flag" aria-hidden="true"></span><span id="node-label">Edge node</span></p>
          <ul class="badges">
            <li>IPv4</li>
            <li>TLS 1.3</li>
            <li>HTTP/2</li>
          </ul>
        </div>
      </section>

      <section id="infrastructure">
        <h2>Infrastructure</h2>
        <div class="grid">
          <article class="panel">
            <h3>Edge delivery</h3>
            <p>Connections terminate at the location nearest to the client, which keeps round trips short and predictable.</p>
          </article>
          <article class="panel">
            <h3>Transit &amp; routing</h3>
            <p>Every location is provisioned with more than one upstream, so traffic can move away from a degraded path.</p>
          </article>
          <article class="panel">
            <h3>Operations</h3>
            <p>Locations are built from a single configuration baseline and watched continuously for capacity and reachability.</p>
          </article>
        </div>
      </section>

      <section id="contact">
        <h2>Contact</h2>
        <p class="lede">Operational issues and abuse reports reach us at <a href="mailto:abuse@peakora.network">abuse@peakora.network</a>.</p>
      </section>
    </main>

    <footer class="site-foot">
      <p>© <span id="year">{{YEAR}}</span> Peakora Network</p>
      <p><a href="#network">Back to top</a></p>
    </footer>
  </body>
</html>
```

- [ ] **Step 5: Создать `src/styles.css`**

Правила `@font-face` появятся здесь в Task 6 — сейчас работают запасные системные шрифты из стека.

```css
/* Подмножество токенов peakora-cabinet/frontend/src/styles/tokens.css: только тёмная тема. */
:root {
  --bg: #070b16;
  --bg-2: #0b1224;
  --text: #eaf0ff;
  --text-dim: #93a0c2;
  --accent: #37e0c9;
  --accent-2: #6a8bff;
  --card-1: rgba(33, 43, 71, 0.62);
  --card-2: rgba(13, 18, 34, 0.44);
  --border: rgba(255, 255, 255, 0.12);
  --shadow: 0 30px 60px -20px rgba(0, 0, 0, 0.65), 0 8px 24px -12px rgba(0, 0, 0, 0.5);
  --r-lg: 26px;
  --r-sm: 12px;
  --font-display: "Space Grotesk", system-ui, sans-serif;
  --font-body: "Inter", system-ui, sans-serif;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  min-height: 100vh;
  overflow-x: hidden;
  background: var(--bg);
  color: var(--text);
  font: 400 16px/1.65 var(--font-body);
  -webkit-font-smoothing: antialiased;
}

body::before {
  content: "";
  position: fixed;
  inset: 0;
  z-index: -3;
  background: radial-gradient(120% 80% at 50% -10%, var(--bg-2), var(--bg) 60%);
}

/* Aurora — три размытых пятна за содержимым. */
.aurora {
  position: fixed;
  inset: -20vmax;
  z-index: -2;
  filter: blur(70px) saturate(140%);
  opacity: 0.85;
  pointer-events: none;
}
.aurora span { position: absolute; border-radius: 50%; mix-blend-mode: screen; }
.b1 {
  width: 52vmax; height: 52vmax; left: -6vmax; top: -8vmax;
  background: radial-gradient(circle at 30% 30%, var(--accent), transparent 62%);
  animation: drift-a 52s ease-in-out infinite;
}
.b2 {
  width: 46vmax; height: 46vmax; right: -8vmax; top: 2vmax;
  background: radial-gradient(circle at 60% 40%, var(--accent-2), transparent 60%);
  animation: drift-b 64s -21s ease-in-out infinite;
}
.b3 {
  width: 44vmax; height: 44vmax; left: 20vmax; bottom: -16vmax; opacity: 0.7;
  background: radial-gradient(circle at 50% 50%, var(--accent), transparent 60%);
  animation: drift-c 58s -37s ease-in-out infinite;
}
@keyframes drift-a { 50% { transform: translate3d(6vmax, 4vmax, 0) scale(1.08); } }
@keyframes drift-b { 50% { transform: translate3d(-5vmax, 6vmax, 0) scale(1.05); } }
@keyframes drift-c { 50% { transform: translate3d(4vmax, -5vmax, 0) scale(1.1); } }
@media (prefers-reduced-motion: reduce) {
  .aurora span { animation: none; }
}

.site-head, main, .site-foot { width: min(1080px, 100% - 2.5rem); margin-inline: auto; }

.site-head {
  display: flex; align-items: center; justify-content: space-between;
  gap: 1rem; flex-wrap: wrap; padding: 1.5rem 0;
}
.brand {
  display: inline-flex; align-items: center; gap: 0.6rem;
  color: var(--text); text-decoration: none;
  font-family: var(--font-display); font-weight: 600; letter-spacing: -0.01em;
}
.brand svg { color: var(--accent-2); }
.brand b { color: var(--text-dim); font-weight: 600; }
.site-head nav { display: flex; gap: 1.25rem; }
.site-head nav a { color: var(--text-dim); text-decoration: none; font-size: 0.92rem; }
.site-head nav a:hover { color: var(--text); }

.hero { padding: 4rem 0 3rem; }
.eyebrow {
  margin: 0 0 0.75rem; color: var(--accent); font-weight: 500;
  font-size: 0.8rem; letter-spacing: 0.14em; text-transform: uppercase;
}
h1 {
  margin: 0 0 1rem; max-width: 18ch;
  font-family: var(--font-display); font-weight: 600;
  font-size: clamp(2rem, 5vw, 3.25rem); line-height: 1.1; letter-spacing: -0.02em;
}
h2 {
  margin: 0 0 1.5rem;
  font-family: var(--font-display); font-weight: 600;
  font-size: clamp(1.35rem, 2.4vw, 1.75rem); letter-spacing: -0.01em;
}
h3 { margin: 0 0 0.6rem; font-family: var(--font-display); font-weight: 600; font-size: 1.05rem; }
.lede { margin: 0 0 2.5rem; max-width: 62ch; color: var(--text-dim); font-size: clamp(1rem, 1.6vw, 1.125rem); }

.panel {
  padding: 1.75rem;
  background: linear-gradient(160deg, var(--card-1), var(--card-2));
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow);
  backdrop-filter: blur(30px);
}
.node { max-width: 30rem; }
.node-head {
  display: flex; align-items: center; gap: 0.5rem; margin: 0;
  color: var(--accent); font-size: 0.8rem; letter-spacing: 0.1em; text-transform: uppercase;
}
.dot {
  width: 0.5rem; height: 0.5rem; border-radius: 50%;
  background: var(--accent); box-shadow: 0 0 0 4px rgba(55, 224, 201, 0.16);
}
.node-name {
  display: flex; align-items: center; gap: 0.6rem; margin: 0.85rem 0 1.25rem;
  font-family: var(--font-display); font-weight: 600; font-size: 1.5rem;
}
.flag:empty { display: none; }
.badges { display: flex; flex-wrap: wrap; gap: 0.5rem; margin: 0; padding: 0; list-style: none; }
.badges li {
  padding: 0.25rem 0.6rem; border: 1px solid var(--border); border-radius: var(--r-sm);
  color: var(--text-dim); font-size: 0.78rem;
}

section + section { padding-top: 3rem; }
.grid { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr)); }
.grid p { margin: 0; color: var(--text-dim); font-size: 0.95rem; }

a { color: var(--accent); }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; border-radius: 4px; }

.site-foot {
  display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap;
  padding: 4rem 0 2.5rem; color: var(--text-dim); font-size: 0.85rem;
}
.site-foot p { margin: 0; }
.site-foot a { color: var(--text-dim); }

.notfound { padding: 5rem 0 4rem; }
.notfound .code {
  margin: 0 0 0.5rem;
  font-family: var(--font-display); font-weight: 600; font-size: clamp(3rem, 10vw, 5rem);
  line-height: 1; color: var(--text-dim);
}
```

Футер использует `--text-dim`, а не более тусклый оттенок из кабинета: `#5f6b88` на `#070b16` даёт контраст 3.7 : 1 и не проходит WCAG AA для мелкого текста, `#93a0c2` даёт 7.4 : 1.

- [ ] **Step 6: Убедиться, что тесты проходят**

Run: `node --test tests/markup.test.mjs`
Expected: PASS, 5 тестов

- [ ] **Step 7: Коммит**

```bash
git add src/index.html src/styles.css src/assets/logo.svg tests/markup.test.mjs
git commit -m "feat: разметка и стили страницы узла"
```

---

### Task 3: Оживление страницы

**Files:**
- Create: `src/app.js`
- Test: `tests/app.test.mjs`

**Interfaces:**
- Consumes: `countryFromHostname`, `flagFromCode`, `nodeLabel`, `pageTitle` из `src/lib.js`; элементы `node-label`, `node-flag`, `year` из Task 2.
- Produces: `applyNode(doc, hostname, now): { code, name } | null` — экспорт, который переиспользует Task 5 (сборка переписывает спецификатор импорта на хэшированное имя).

- [ ] **Step 1: Написать падающий тест**

Файл `tests/app.test.mjs`. Поддельный `document` из трёх строк избавляет от jsdom — зависимостей в проекте нет.

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { applyNode } from '../src/app.js';

function fakeDoc(ids) {
  const els = new Map(ids.map((id) => [id, { textContent: '' }]));
  return { title: '', getElementById: (id) => els.get(id) ?? null, els };
}

const AT = new Date('2031-04-15T12:00:00Z');

test('подставляет страну, флаг, год и заголовок', () => {
  const doc = fakeDoc(['node-label', 'node-flag', 'year']);
  applyNode(doc, 'pl.peakora.network', AT);
  assert.equal(doc.els.get('node-label').textContent, 'Poland · Edge node');
  assert.equal(doc.els.get('node-flag').textContent, '\u{1F1F5}\u{1F1F1}');
  assert.equal(doc.els.get('year').textContent, '2031');
  assert.equal(doc.title, 'Poland — Peakora Network');
});

test('на неопознанном хосте остаётся нейтральной', () => {
  const doc = fakeDoc(['node-label', 'node-flag', 'year']);
  applyNode(doc, 'philipp.peakora.network', AT);
  assert.equal(doc.els.get('node-label').textContent, 'Edge node');
  assert.equal(doc.els.get('node-flag').textContent, '');
  assert.equal(doc.title, 'Peakora Network — Edge infrastructure');
});

test('не трогает заголовок страницы без карточки узла', () => {
  const doc = fakeDoc(['year']);
  assert.doesNotThrow(() => applyNode(doc, 'pl.peakora.network', AT));
  assert.equal(doc.els.get('year').textContent, '2031');
  assert.equal(doc.title, '', 'страница 404 должна сохранить свой заголовок');
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `node --test tests/app.test.mjs`
Expected: FAIL — `Cannot find module .../src/app.js`

- [ ] **Step 3: Написать `src/app.js`**

```js
import { countryFromHostname, flagFromCode, nodeLabel, pageTitle } from './lib.js';

// Разметка уже содержит нейтральные значения — здесь они только уточняются.
// Всё под guard'ами: этот же модуль грузится на странице 404, где карточки узла нет.
export function applyNode(doc, hostname, now) {
  const country = countryFromHostname(hostname);

  const label = doc.getElementById('node-label');
  if (label) {
    label.textContent = nodeLabel(country);
    doc.title = pageTitle(country);
  }

  const flag = doc.getElementById('node-flag');
  if (flag) flag.textContent = country ? flagFromCode(country.code) : '';

  const year = doc.getElementById('year');
  if (year) year.textContent = String(now.getFullYear());

  return country;
}

if (typeof document !== 'undefined' && typeof location !== 'undefined') {
  applyNode(document, location.hostname, new Date());
}
```

- [ ] **Step 4: Убедиться, что тесты проходят**

Run: `node --test tests/app.test.mjs`
Expected: PASS, 3 теста

- [ ] **Step 5: Коммит**

```bash
git add src/app.js tests/app.test.mjs
git commit -m "feat: подстановка страны узла и года на странице"
```

---

### Task 4: Страница 404

Без неё nginx отдаёт свою дефолтную страницу с версией — прямой признак пустого хоста.

**Files:**
- Create: `src/404.html`
- Modify: `tests/markup.test.mjs` — расширить проверки на оба файла

**Interfaces:**
- Consumes: классы из `src/styles.css`, плейсхолдеры `<!--LOGO-->` и `{{YEAR}}`.
- Produces: `dist/404.html` — цель директивы `error_page` из Task 8.

- [ ] **Step 1: Расширить тест на оба файла**

В `tests/markup.test.mjs` заменить два места. Первое — тест про CSP:

```js
test('разметка совместима с CSP: нет инлайнового скрипта и style=', () => {
  for (const name of ['index.html', '404.html']) {
    const html = read(name);
    assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/i, `${name}: инлайновый <script>`);
    assert.doesNotMatch(html, /\sstyle="/i, `${name}: атрибут style=`);
  }
});
```

Второе — тест про запрещённые слова: в списке файлов заменить `['index.html', 'styles.css', 'assets/logo.svg']` на `['index.html', '404.html', 'styles.css', 'assets/logo.svg']`.

И добавить отдельный тест:

```js
test('404 повторяет каркас, но не содержит карточку узла', () => {
  const html = read('404.html');
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<meta name="robots" content="noindex, nofollow"/);
  assert.ok(html.includes('<!--LOGO-->'));
  assert.ok(html.includes('id="year"'));
  assert.ok(!html.includes('id="node-label"'), '404 не должна перебивать свой заголовок');
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `node --test tests/markup.test.mjs`
Expected: FAIL — `ENOENT ... src/404.html`

- [ ] **Step 3: Создать `src/404.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />

    <title>Not found — Peakora Network</title>
    <meta name="description" content="The requested path is not available on this Peakora Network host." />
    <meta name="robots" content="noindex, nofollow" />
    <meta name="color-scheme" content="dark" />
    <meta name="theme-color" content="#070b16" />

    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="alternate icon" type="image/png" href="/favicon.png" />
    <link rel="stylesheet" href="/assets/styles.css" />
    <script type="module" src="/assets/app.js"></script>
  </head>
  <body>
    <div class="aurora" aria-hidden="true"><span class="b1"></span><span class="b2"></span><span class="b3"></span></div>

    <header class="site-head">
      <a class="brand" href="/">
        <!--LOGO-->
        <span>Peakora <b>Network</b></span>
      </a>
    </header>

    <main>
      <section class="notfound">
        <p class="code">404</p>
        <h1>Nothing at this path</h1>
        <p class="lede">The address you requested does not exist on this host.</p>
        <p><a href="/">Return to the front page</a></p>
      </section>
    </main>

    <footer class="site-foot">
      <p>© <span id="year">{{YEAR}}</span> Peakora Network</p>
    </footer>
  </body>
</html>
```

- [ ] **Step 4: Убедиться, что тесты проходят**

Run: `node --test tests/markup.test.mjs`
Expected: PASS, 6 тестов

- [ ] **Step 5: Коммит**

```bash
git add src/404.html tests/markup.test.mjs
git commit -m "feat: страница 404 вместо дефолтной страницы nginx"
```

---

### Task 5: Сборка

**Files:**
- Create: `build.mjs`
- Create: `src/assets/robots.txt`
- Test: `tests/dist.test.mjs`

**Interfaces:**
- Consumes: всё из `src/`.
- Produces: каталог `dist/` — `index.html`, `404.html`, `robots.txt`, `assets/styles.<hash>.css`, `assets/lib.<hash>.js`, `assets/app.<hash>.js`. Task 8 раскатывает именно его.

- [ ] **Step 1: Создать `src/assets/robots.txt`**

```
# Peakora Network edge host. Duplicate content across locations is not useful
# to index; the same directive is sent as an X-Robots-Tag header.
User-agent: *
Disallow: /
```

- [ ] **Step 2: Написать падающий тест**

Файл `tests/dist.test.mjs`:

```js
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');

const TEXT_EXT = new Set(['.html', '.css', '.js', '.svg', '.txt']);
const NAMESPACES = ['http://www.w3.org/2000/svg', 'http://www.w3.org/1999/xlink'];
const FORBIDDEN = [
  'vpn', 'proxy', 'xray', 'reality', 'remnawave',
  'marzban', 'shadowsocks', 'vless', 'trojan',
];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const textFiles = () => walk(DIST).filter((f) => TEXT_EXT.has(extname(f)));

before(() => {
  execFileSync(process.execPath, ['build.mjs'], { cwd: ROOT, stdio: 'pipe' });
});

test('сборка подставляет хэшированные имена и убирает плейсхолдеры', () => {
  const html = readFileSync(join(DIST, 'index.html'), 'utf8');
  assert.match(html, /href="\/assets\/styles\.[0-9a-f]{8}\.css"/);
  assert.match(html, /src="\/assets\/app\.[0-9a-f]{8}\.js"/);
  assert.ok(!html.includes('<!--LOGO-->'), 'плейсхолдер логотипа остался');
  assert.ok(!html.includes('{{YEAR}}'), 'плейсхолдер года остался');
  assert.match(html, /<path fill="currentColor"/, 'логотип не заинлайнен');
  assert.ok(!html.includes('<!--'), 'HTML-комментарии не удалены');
});

test('импорт в app.js указывает на существующий хэшированный lib', () => {
  const appFile = walk(join(DIST, 'assets')).find((f) => /app\.[0-9a-f]{8}\.js$/.test(f));
  assert.ok(appFile, 'нет собранного app.js');
  const source = readFileSync(appFile, 'utf8');
  const match = source.match(/from ['"]\.\/(lib\.[0-9a-f]{8}\.js)['"]/);
  assert.ok(match, 'спецификатор импорта не переписан');
  assert.doesNotThrow(() => statSync(join(DIST, 'assets', match[1])));
});

test('в dist нет ни одного внешнего запроса', () => {
  for (const file of textFiles()) {
    let text = readFileSync(file, 'utf8');
    for (const ns of NAMESPACES) text = text.split(ns).join('');
    assert.doesNotMatch(text, /https?:\/\//i, `${file}: абсолютный URL`);
    assert.doesNotMatch(text, /(?:src|href)\s*=\s*["']\/\//i, `${file}: протокол-относительный URL`);
    assert.doesNotMatch(text, /url\(\s*["']?\/\//i, `${file}: протокол-относительный url()`);
  }
});

test('в dist нет запрещённых слов', () => {
  for (const file of textFiles()) {
    const text = readFileSync(file, 'utf8').toLowerCase();
    for (const word of FORBIDDEN) {
      assert.ok(!text.includes(word), `${file} содержит «${word}»`);
    }
  }
});

test('страница ничего не запоминает и никуда не отчитывается', () => {
  const tracking = ['localstorage', 'sessionstorage', 'document.cookie', 'indexeddb', 'sendbeacon', 'xmlhttprequest', 'navigator.connection'];
  for (const file of textFiles().filter((f) => extname(f) === '.js')) {
    const text = readFileSync(file, 'utf8').toLowerCase();
    for (const api of tracking) {
      assert.ok(!text.includes(api), `${file} обращается к ${api}`);
    }
    assert.doesNotMatch(text, /\bfetch\s*\(/, `${file} делает сетевой запрос`);
  }
});

test('сборка укладывается в бюджет размера', () => {
  const indexBytes = statSync(join(DIST, 'index.html')).size;
  assert.ok(indexBytes <= 30 * 1024, `index.html ${indexBytes} B > 30 KB`);

  const all = walk(DIST);
  const total = all.reduce((sum, f) => sum + statSync(f).size, 0);
  assert.ok(total <= 250 * 1024, `dist ${total} B > 250 KB`);

  const fonts = all.filter((f) => extname(f) === '.woff2');
  const fontBytes = fonts.reduce((sum, f) => sum + statSync(f).size, 0);
  assert.ok(fontBytes <= 100 * 1024, `шрифты ${fontBytes} B > 100 KB`);
});
```

- [ ] **Step 3: Убедиться, что тест падает**

Run: `node --test tests/dist.test.mjs`
Expected: FAIL — `Cannot find module .../build.mjs`

- [ ] **Step 4: Написать `build.mjs`**

Порядок шагов важен: шрифты хэшируются раньше CSS, потому что CSS на них ссылается; `lib.js` — раньше `app.js`, потому что `app.js` его импортирует; HTML-комментарии удаляются после подстановки логотипа, иначе `<!--LOGO-->` исчезнет вместе с ними.

```js
#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
import { copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const SRC = join(ROOT, 'src');
const ASSETS = join(SRC, 'assets');
const DIST = join(ROOT, 'dist');
const DIST_ASSETS = join(DIST, 'assets');

const hash = (data) => createHash('sha256').update(data).digest('hex').slice(0, 8);

// Только комментарии и пробелы, без трогания «:» и «,»: агрессивная минификация
// CSS ломается о медиазапросы и значения вроде clamp() чаще, чем экономит байты.
const minifyCss = (css) =>
  css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{};])\s*/g, '$1')
    .trim();

const stripHtmlComments = (html) => html.replace(/<!--[\s\S]*?-->/g, '');

async function emit(name, data) {
  const dot = name.lastIndexOf('.');
  const hashed = `${name.slice(0, dot)}.${hash(data)}${name.slice(dot)}`;
  await writeFile(join(DIST_ASSETS, hashed), data);
  return `/assets/${hashed}`;
}

await rm(DIST, { recursive: true, force: true });
await mkdir(DIST_ASSETS, { recursive: true });

// 1. Шрифты — первыми, на них ссылается CSS.
const fontsDir = join(ASSETS, 'fonts');
const fontUrls = new Map();
if (existsSync(fontsDir)) {
  for (const name of readdirSync(fontsDir).filter((f) => extname(f) === '.woff2')) {
    fontUrls.set(name, await emit(name, await readFile(join(fontsDir, name))));
  }
}

// 2. CSS — с переписанными путями к шрифтам.
let css = await readFile(join(SRC, 'styles.css'), 'utf8');
for (const [name, url] of fontUrls) {
  css = css.split(`/assets/fonts/${name}`).join(url);
}
const cssUrl = await emit('styles.css', minifyCss(css));

// 3. lib.js, затем app.js с переписанным спецификатором импорта.
const libUrl = await emit('lib.js', await readFile(join(SRC, 'lib.js'), 'utf8'));
const libFile = libUrl.slice('/assets/'.length);
const app = (await readFile(join(SRC, 'app.js'), 'utf8')).replace(
  /(from\s+['"])\.\/lib\.js(['"])/,
  `$1./${libFile}$2`,
);
const appUrl = await emit('app.js', app);

// 4. HTML.
const logo = (await readFile(join(ASSETS, 'logo.svg'), 'utf8')).trim();
const year = String(new Date().getFullYear());
for (const page of ['index.html', '404.html']) {
  let html = await readFile(join(SRC, page), 'utf8');
  html = html.replace('<!--LOGO-->', logo);
  html = stripHtmlComments(html);
  html = html.split('/assets/styles.css').join(cssUrl);
  html = html.split('/assets/app.js').join(appUrl);
  html = html.split('{{YEAR}}').join(year);
  await writeFile(join(DIST, page), html);
}

// 5. Файлы, которые должны лежать в корне.
for (const name of ['favicon.svg', 'favicon.png', 'apple-touch-icon.png', 'robots.txt']) {
  const from = join(ASSETS, name);
  if (existsSync(from)) await copyFile(from, join(DIST, name));
}

// 6. Отчёт.
const listing = [];
const walk = (dir, prefix = '') => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) walk(join(dir, entry.name), `${prefix}${entry.name}/`);
    else listing.push(`${prefix}${entry.name}`);
  }
};
walk(DIST);
let total = 0;
for (const name of listing.sort()) {
  const { size } = await stat(join(DIST, name));
  total += size;
  console.log(`  ${String(size).padStart(7)} B  ${name}`);
}
console.log(`  ${String(total).padStart(7)} B  ИТОГО`);
```

- [ ] **Step 5: Убедиться, что тесты проходят**

Run: `node --test tests/dist.test.mjs`
Expected: PASS, 6 тестов

- [ ] **Step 6: Прогнать весь набор**

Run: `node --test`
Expected: PASS, 21 тест (6 country + 6 markup + 3 app + 6 dist)

- [ ] **Step 7: Коммит** (без `dist/` — он коммитится в Task 9, когда состав файлов окончателен)

```bash
git add build.mjs src/assets/robots.txt tests/dist.test.mjs
git commit -m "feat: сборка с хэшированием ассетов и проверками dist"
```

---

### Task 6: Шрифты

**Files:**
- Create: `tools/fetch-fonts.mjs`
- Create: `src/assets/fonts/` (6 файлов `.woff2` + `OFL.txt`)
- Modify: `src/styles.css` — добавить правила `@font-face` в начало
- Test: `tests/fonts.test.mjs`

**Interfaces:**
- Consumes: имена файлов шрифтов зафиксированы, потому что на них ссылается `styles.css`.
- Produces: файлы `src/assets/fonts/*.woff2`, которые Task 5 уже умеет хэшировать.

- [ ] **Step 1: Написать падающий тест**

Файл `tests/fonts.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));

const FILES = [
  'inter-400-latin.woff2',
  'inter-400-latin-ext.woff2',
  'inter-500-latin.woff2',
  'inter-500-latin-ext.woff2',
  'space-grotesk-600-latin.woff2',
  'space-grotesk-600-latin-ext.woff2',
];

test('шрифты лежат локально и являются woff2', () => {
  for (const name of FILES) {
    const buf = readFileSync(`${SRC}assets/fonts/${name}`);
    assert.equal(buf.subarray(0, 4).toString('latin1'), 'wOF2', `${name}: не woff2`);
  }
});

test('шрифты укладываются в 100 KB', () => {
  const total = FILES.reduce((sum, n) => sum + statSync(`${SRC}assets/fonts/${n}`).size, 0);
  assert.ok(total <= 100 * 1024, `шрифты ${total} B > 100 KB`);
});

test('лицензия SIL OFL лежит рядом со шрифтами', () => {
  const text = readFileSync(`${SRC}assets/fonts/OFL.txt`, 'utf8');
  assert.match(text, /SIL OPEN FONT LICENSE/i);
});

test('styles.css подключает только локальные шрифты', () => {
  const css = readFileSync(`${SRC}styles.css`, 'utf8');
  for (const name of FILES) {
    assert.ok(css.includes(`/assets/fonts/${name}`), `в CSS нет ссылки на ${name}`);
  }
  assert.doesNotMatch(css, /https?:\/\//i, 'CSS тянет что-то извне');
  assert.match(css, /font-display:\s*swap/);
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `node --test tests/fonts.test.mjs`
Expected: FAIL — `ENOENT ... inter-400-latin.woff2`

- [ ] **Step 3: Написать `tools/fetch-fonts.mjs`**

Скрипт разовый: он вызывается вручную, в сборке не участвует и в `dist` не попадает. Space Grotesk и Inter распространяются под SIL OFL, самостоятельный хостинг разрешён.

Скрипт печатает готовый блок `@font-face` в stdout, а диагностику — в stderr, поэтому вывод можно перенаправить в файл и вставить как есть. Значения `unicode-range` берутся из ответа Google, а не переписываются руками: они меняются от версии шрифта к версии.

```js
#!/usr/bin/env node
// Разовая выкачка подмножеств шрифтов с Google Fonts в src/assets/fonts/.
// В сборке НЕ участвует: dist собирается из уже скачанных файлов.
// stdout — готовый блок @font-face, stderr — имена и размеры файлов.
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../src/assets/fonts/', import.meta.url));
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const WANTED = [
  { family: 'Inter', weights: [400, 500], slug: 'inter' },
  { family: 'Space Grotesk', weights: [600], slug: 'space-grotesk' },
];
const SUBSETS = ['latin', 'latin-ext'];

await mkdir(OUT, { recursive: true });

const faces = [];
let total = 0;

for (const { family, weights, slug } of WANTED) {
  const spec = `${family.replace(/ /g, '+')}:wght@${weights.join(';')}`;
  const cssUrl = `https://fonts.googleapis.com/css2?family=${spec}&display=swap`;
  const css = await (await fetch(cssUrl, { headers: { 'user-agent': UA } })).text();

  // Google размечает блоки комментарием с именем подмножества.
  for (const block of css.split('/*').slice(1)) {
    const subset = block.slice(0, block.indexOf('*/')).trim();
    if (!SUBSETS.includes(subset)) continue;

    const weight = Number(block.match(/font-weight:\s*(\d+)/)?.[1]);
    const url = block.match(/src:\s*url\((https:[^)]+\.woff2)\)/)?.[1];
    const range = block.match(/unicode-range:\s*([^;]+);/)?.[1]?.trim();
    if (!weights.includes(weight) || !url || !range) continue;

    const name = `${slug}-${weight}-${subset}.woff2`;
    const bytes = Buffer.from(await (await fetch(url)).arrayBuffer());
    await writeFile(OUT + name, bytes);
    total += bytes.length;
    console.error(`${name.padEnd(34)} ${String(bytes.length).padStart(6)} B`);

    faces.push(
      [
        '@font-face {',
        `  font-family: "${family}";`,
        '  font-style: normal;',
        `  font-weight: ${weight};`,
        '  font-display: swap;',
        `  src: url(/assets/fonts/${name}) format("woff2");`,
        `  unicode-range: ${range};`,
        '}',
      ].join('\n'),
    );
  }
}

console.error(`${'ИТОГО'.padEnd(34)} ${String(total).padStart(6)} B  (бюджет 102400)`);
console.log(faces.join('\n'));
```

- [ ] **Step 4: Скачать шрифты и лицензию**

Run: `node tools/fetch-fonts.mjs > faces.tmp.css`
Expected: в stderr — шесть строк с именами файлов и размерами плюс строка ИТОГО в пределах 102400 B; в `faces.tmp.css` — шесть блоков `@font-face`.

Затем положить рядом текст лицензии:

```bash
curl -sSL -o src/assets/fonts/OFL.txt https://raw.githubusercontent.com/rsms/inter/master/LICENSE.txt
```

Если сеть недоступна: шрифты — необязательное улучшение. Стек `system-ui, sans-serif` в `--font-body` и `--font-display` уже работает, страница остаётся целой. В этом случае задача откладывается, а тест `tests/fonts.test.mjs` не создаётся — остальные задачи выполняются полностью.

- [ ] **Step 5: Вставить блок в начало `src/styles.css`**

Содержимое `faces.tmp.css` целиком помещается в самое начало `src/styles.css` — перед комментарием о токенах и блоком `:root`. После этого временный файл удаляется:

```bash
rm faces.tmp.css
```

Подмножество `latin-ext` нужно не для украшения: названия стран приходят из ICU и содержат `Türkiye`, `Côte d'Ivoire`, `Curaçao`, `Åland Islands`. Без него они рассыплются на запасной шрифт прямо посреди строки.

- [ ] **Step 6: Убедиться, что тесты проходят**

Run: `node --test`
Expected: PASS — все тесты, включая 4 новых про шрифты и бюджет из `tests/dist.test.mjs`

Если суммарный размер шрифтов превысил 100 KB: единственное место, где используется Inter 500, — правило `.eyebrow`. Поменять там `font-weight: 500` на `400`, удалить оба файла `inter-500-*.woff2`, соответствующие `@font-face` и обе строки из списка `FILES` в тесте.

- [ ] **Step 7: Коммит**

```bash
git add tools/fetch-fonts.mjs src/assets/fonts src/styles.css tests/fonts.test.mjs
git commit -m "feat: локальные шрифты Inter и Space Grotesk вместо CDN"
```

---

### Task 7: Иконки

**Files:**
- Create: `src/assets/favicon.svg`
- Create: `src/assets/favicon.png` (32×32)
- Create: `src/assets/apple-touch-icon.png` (180×180)
- Test: `tests/icons.test.mjs`

**Interfaces:**
- Consumes: разметка из Task 2 и Task 4 уже ссылается на `/favicon.svg`, `/favicon.png`, `/apple-touch-icon.png`.
- Produces: три файла, которые Task 5 копирует в корень `dist/`.

- [ ] **Step 1: Написать падающий тест**

Файл `tests/icons.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ASSETS = fileURLToPath(new URL('../src/assets/', import.meta.url));

test('favicon.svg — валидный SVG без внешних ссылок', () => {
  const svg = readFileSync(ASSETS + 'favicon.svg', 'utf8');
  assert.match(svg, /^<svg[\s>]/);
  assert.doesNotMatch(svg.split('http://www.w3.org/2000/svg').join(''), /https?:\/\//i);
});

test('растровые иконки — настоящие PNG нужного размера', () => {
  const sizes = { 'favicon.png': 32, 'apple-touch-icon.png': 180 };
  for (const [name, expected] of Object.entries(sizes)) {
    const buf = readFileSync(ASSETS + name);
    assert.equal(buf.subarray(1, 4).toString('latin1'), 'PNG', `${name}: не PNG`);
    // Заголовок IHDR: ширина и высота — big-endian uint32 по смещениям 16 и 20.
    assert.equal(buf.readUInt32BE(16), expected, `${name}: ширина`);
    assert.equal(buf.readUInt32BE(20), expected, `${name}: высота`);
  }
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `node --test tests/icons.test.mjs`
Expected: FAIL — `ENOENT ... favicon.svg`

- [ ] **Step 3: Скопировать `favicon.svg` из кабинета**

```bash
cp ../peakora-cabinet/frontend/public/favicon.svg src/assets/favicon.svg
```

Файл берётся как есть: он не инлайнится в HTML, а отдаётся отдельным ресурсом, поэтому атрибуты `style=` внутри него под CSP страницы не попадают.

- [ ] **Step 4: Отрисовать растровые иконки**

Написать временный файл `icon.html` в каталоге для временных файлов (не в репозитории):

```html
<!doctype html>
<html><head><meta charset="utf-8"><style>
  html,body{margin:0;background:transparent}
  #box{width:180px;height:180px;border-radius:40px;background:#070b16;
       display:flex;align-items:center;justify-content:center}
  #box svg{width:96px;height:92px;color:#863bff}
</style></head>
<body><div id="box"><!-- сюда вставить содержимое src/assets/logo.svg --></div></body></html>
```

Открыть его в headless-браузере, выставить окно 200×200, снять скриншот элемента `#box` — это `apple-touch-icon.png`. Затем поменять в стилях `180px` на `32px`, `40px` на `7px`, `96px/92px` на `18px/17px` и снять второй скриншот — это `favicon.png`. Оба сохранить в `src/assets/`.

Инлайновые стили здесь допустимы: файл временный, в репозиторий и в `dist` не попадает, CSP на него не распространяется.

- [ ] **Step 5: Убедиться, что тесты проходят**

Run: `node --test tests/icons.test.mjs`
Expected: PASS, 2 теста

- [ ] **Step 6: Коммит**

```bash
git add src/assets/favicon.svg src/assets/favicon.png src/assets/apple-touch-icon.png tests/icons.test.mjs
git commit -m "feat: иконки сайта"
```

---

### Task 8: nginx и раскатка

**Files:**
- Create: `deploy/nginx/peakora-node.conf`
- Create: `deploy/install.sh`
- Test: `tests/deploy.test.mjs`

**Interfaces:**
- Consumes: `dist/` из Task 5, включая `404.html` из Task 4.
- Produces: фрагмент для `include` в `server {}` ноды и идемпотентный установщик.

- [ ] **Step 1: Написать падающий тест**

Файл `tests/deploy.test.mjs`. Проверка «в каждом `location` есть `X-Robots-Tag`» — не педантизм: в nginx первый же `add_header` внутри `location` отменяет все унаследованные с уровня `server`, и заголовок молча пропадёт.

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DEPLOY = fileURLToPath(new URL('../deploy/', import.meta.url));
const snippet = () => readFileSync(DEPLOY + 'nginx/peakora-node.conf', 'utf8');
const installer = () => readFileSync(DEPLOY + 'install.sh', 'utf8');

test('файлы для Linux записаны с окончаниями LF', () => {
  assert.ok(!installer().includes('\r'), 'install.sh содержит CR — на ноде он не запустится');
  assert.ok(!snippet().includes('\r'), 'фрагмент nginx содержит CR');
});

test('фрагмент закрывает дефолтную страницу nginx и задаёт кэш', () => {
  const conf = snippet();
  assert.match(conf, /root\s+\/var\/www\/html;/);
  assert.match(conf, /server_tokens\s+off;/);
  assert.match(conf, /error_page\s+404\s+\/404\.html;/);
  assert.match(conf, /location\s+=\s+\/404\.html\s*\{[^}]*internal;/);
  assert.match(conf, /try_files\s+\$uri\s+\$uri\/\s+=404;/);
  assert.match(conf, /expires\s+1y;/);
  assert.match(conf, /Cache-Control\s+"no-cache, must-revalidate"/);
  assert.match(conf, /Content-Security-Policy/);
});

test('каждый location несёт свои заголовки', () => {
  const blocks = snippet().split(/\blocation\b/).slice(1);
  assert.ok(blocks.length >= 3, 'ожидались блоки /assets/, / и = /404.html');
  for (const [i, block] of blocks.entries()) {
    assert.match(block, /X-Robots-Tag/, `location #${i + 1} без X-Robots-Tag`);
    assert.match(block, /X-Content-Type-Options/, `location #${i + 1} без nosniff`);
  }
});

test('установщик синтаксически корректен и защищён от частичного выполнения', () => {
  const sh = installer();
  assert.match(sh, /^#!\/usr\/bin\/env bash/);
  assert.match(sh, /set -euo pipefail/);
  assert.match(sh, /nginx -t/);
  execFileSync('bash', ['-n', DEPLOY + 'install.sh'], { stdio: 'pipe' });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `node --test tests/deploy.test.mjs`
Expected: FAIL — `ENOENT ... deploy/nginx/peakora-node.conf`

- [ ] **Step 3: Создать `deploy/nginx/peakora-node.conf`**

```nginx
# Peakora Network edge host — статика.
# Подключается ВНУТРЬ существующего server{} ноды:
#     include /etc/nginx/snippets/peakora-node.conf;
# Блок ноды не переписывается: server_name, listen и сертификаты остаются как есть,
# заменяются только root, index и add_header в его конце.
#
# Заголовки повторяются в каждом location намеренно: в nginx первый add_header
# внутри location отменяет все унаследованные с уровня server.

root /var/www/html;
index index.html;
server_tokens off;

# Имена ассетов содержат хэш содержимого, поэтому кэшируются надолго.
location /assets/ {
    try_files $uri =404;
    expires 1y;
    add_header Cache-Control "public, immutable" always;
    add_header X-Robots-Tag "noindex, nofollow, noarchive, nosnippet, noimageindex" always;
    add_header X-Content-Type-Options nosniff always;
}

# HTML не кэшируется: он ссылается на текущие хэши.
location / {
    try_files $uri $uri/ =404;
    add_header Cache-Control "no-cache, must-revalidate" always;
    add_header X-Robots-Tag "noindex, nofollow, noarchive, nosnippet, noimageindex" always;
    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy no-referrer always;
    add_header Content-Security-Policy "default-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" always;
}

error_page 404 /404.html;
location = /404.html {
    internal;
    add_header Cache-Control "no-cache" always;
    add_header X-Robots-Tag "noindex, nofollow, noarchive, nosnippet, noimageindex" always;
    add_header X-Content-Type-Options nosniff always;
}
```

- [ ] **Step 4: Создать `deploy/install.sh`**

```bash
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

  if [ -n "$BACKUP" ]; then
    rm -f "$BACKUP"
  fi
fi

echo
echo "Готово. В server{} каждой ноды должна быть строка:"
echo "    include $SNIPPET_DST;"
```

Удаление резервной копии оформлено через `if`, а не через `[ -n "$BACKUP" ] && rm -f ...`: при пустой переменной такой список возвращает 1, и `set -e` уронил бы скрипт на последней строке успешной установки.

- [ ] **Step 5: Убедиться, что тесты проходят**

Run: `node --test tests/deploy.test.mjs`
Expected: PASS, 4 теста

- [ ] **Step 6: Коммит**

```bash
git add deploy tests/deploy.test.mjs
git commit -m "feat: фрагмент nginx и установщик для нод"
```

---

### Task 9: Документация, сборка и визуальная проверка

**Files:**
- Create: `README.md`
- Create: `CLAUDE.md`
- Create: `dist/` (результат сборки, коммитится)

**Interfaces:**
- Consumes: всё предыдущее.
- Produces: репозиторий, готовый к `git pull && sudo deploy/install.sh` на ноде.

- [ ] **Step 1: Собрать и прогнать все тесты**

Run: `node build.mjs && node --test`
Expected: PASS — все тесты; в отчёте сборки `index.html` заметно меньше 30 KB, итог заметно меньше 250 KB

- [ ] **Step 2: Проверить страницу глазами**

Открыть `dist/index.html` в headless-браузере на ширинах 390 px и 1440 px, снять скриншоты. Проверить: фон тёмный, aurora видна, панели читаются, навигация не переносится криво, карточка узла показывает `Edge node` (локальный файл открывается не по хосту вида `pl.…`, поэтому нейтральный вариант — это правильное поведение). Затем открыть `dist/404.html` и убедиться, что каркас тот же.

- [ ] **Step 3: Написать `README.md`**

```markdown
# peakora-web-template

Статический сайт, который nginx отдаёт на домене узла Peakora Network. Один
артефакт на все локации: страна определяется из имени хоста на стороне браузера,
список узлов нигде не публикуется.

## Сборка

    node build.mjs      # собирает dist/
    node --test  # прогоняет проверки

Зависимостей нет — нужен только Node 20 или новее.

## Установка на ноду

    git clone <repo> /opt/peakora-web-template
    cd /opt/peakora-web-template
    sudo deploy/install.sh

Установщик кладёт `dist/` в `/var/www/html`, ставит фрагмент в
`/etc/nginx/snippets/peakora-node.conf`, проверяет конфигурацию через `nginx -t`
и перезагружает nginx. При неудачной проверке фрагмент откатывается.

Одну строку в конфигурацию ноды нужно вписать руками — блоки `server` на разных
нодах различаются, автоматическая правка чужого конфига опаснее ручной:

    server {
        server_name pl.peakora.network;
        listen unix:/dev/shm/nginx.sock ssl proxy_protocol;
        http2 on;

        ssl_certificate     "/etc/nginx/ssl/peakora/fullchain.pem";
        ssl_certificate_key "/etc/nginx/ssl/peakora/privkey.pem";

        include /etc/nginx/snippets/peakora-node.conf;
    }

Строки `root`, `index` и `add_header` из блока при этом убираются: их задаёт
фрагмент.

Обновление: `git pull && sudo deploy/install.sh`.

## Что нужно проверить перед запуском

Ящик `abuse@peakora.network` из футера должен реально принимать почту.
Отбивающийся адрес выглядит хуже, чем его отсутствие. Адрес меняется в одном
месте — константа `CONTACT_EMAIL` в `src/lib.js` и ссылка в `src/index.html`.

## Правила, которые ломать нельзя

- Никаких внешних запросов со страницы. Шрифты, стили, скрипты — только свои.
- Никаких инлайновых `<script>` и атрибутов `style=`: страница работает под
  `Content-Security-Policy: default-src 'self'`.
- Никаких проверяемо-ложных утверждений в текстах.
- Список локаций не публикуется ни в каком виде.

Всё перечисленное проверяется тестами в `tests/`.
```

- [ ] **Step 4: Написать `CLAUDE.md`**

```markdown
# CLAUDE.md

Инструкции для Claude Code при работе с этим репозиторием.

## Обзор проекта

**peakora-web-template — статический сайт, который nginx отдаёт на домене узла
Peakora Network.** Один и тот же `dist/` раскатывается на все ноды; страна узла
определяется в браузере из `location.hostname`, никакой конфигурации на ноде для
этого не нужно.

Зависимостей нет вообще — ни рантайм, ни сборочных. `node_modules` в репозитории
не появляется. Node (≥ 20) нужен только для сборки и тестов; на ноде его нет.

```
src/lib.js      чистая логика (страна, флаг, подписи) — импортируют и браузер, и тесты
src/app.js      привязка к DOM, импортирует lib.js
src/index.html  главная; src/404.html — страница ошибки для error_page
src/styles.css  тёмная тема, токены — подмножество peakora-cabinet
build.mjs       хэширует ассеты, переписывает пути, кладёт результат в dist/
deploy/         фрагмент nginx для include в server{} ноды и install.sh
tools/          разовые скрипты, в сборке не участвуют
```

## Команды

    node build.mjs      сборка в dist/
    node --test  все проверки

## Инварианты

Каждый из них существует по конкретной причине и стережётся тестом. Ломать
нельзя; если кажется, что нужно, — сначала перечитать
`docs/superpowers/specs/2026-08-26-node-decoy-site-design.md`.

- **Ноль внешних запросов со страницы.** Сайт открывается из стран с
  блокировками: внешний CDN может не ответить, и вместо нормальной страницы
  посетитель увидит поехавшую вёрстку. Шрифты лежат локально.
  Стережёт: `tests/dist.test.mjs`, «в dist нет ни одного внешнего запроса».
- **Ни инлайновых `<script>`, ни атрибутов `style=`.** Страница работает под
  `Content-Security-Policy: default-src 'self'` из фрагмента nginx; инлайн она
  просто не выполнит. Стережёт: `tests/markup.test.mjs`, «разметка совместима
  с CSP».
- **Список локаций не публикуется.** Карта «поддомен → город» была бы одинакова
  на всех нодах, и одного запроса к любой из них хватило бы, чтобы получить
  список остальных. Поэтому страна берётся из `Intl.DisplayNames`, а не из
  таблицы. Стережёт: `tests/country.test.mjs` плюс отсутствие данных как таковых.
- **Никаких проверяемо-ложных утверждений в текстах** — ни номера автономной
  системы, ни PeeringDB, ни юрлица, ни метрик. Их легко опровергнуть, пользы
  ноль. Стережёт: ревью; автоматически проверяется только отсутствие
  запрещённых слов (`tests/dist.test.mjs`).

## Изменение текстов

Тексты — английские, тема — тёмная, переключателей нет: так решено в спеке.
Адрес в футере задаётся константой `CONTACT_EMAIL` в `src/lib.js` и ссылкой в
`src/index.html`; ящик обязан реально принимать почту.
```

- [ ] **Step 5: Закоммитить документацию и `dist/`**

`dist/` коммитится намеренно: на ноде не должно быть ни Node, ни сборки.

```bash
git add README.md CLAUDE.md dist
git commit -m "docs: README и CLAUDE.md; собранный dist для раскатки"
```

---

## Порядок и зависимости

Задачи 1 → 5 выполняются подряд: каждая опирается на предыдущую. Задачи 6 и 7
независимы друг от друга и от 8 — их можно делать в любом порядке после 5.
Задача 9 выполняется последней, когда состав `dist/` окончателен.

Задача 6 — единственная, требующая сети. Если она отложена, всё остальное
работает: в `--font-body` и `--font-display` уже стоит запасной системный стек.

---

## Расхождения с исполнением

План выполнен целиком; ниже — места, где реальность оказалась не такой, как
предполагалось при написании. Итог: 32 теста, `dist` — 76 KB.

**Команда тестов.** `node --test tests/` в плане неверна. Начиная с Node 22
позиционный аргумент трактуется как модуль, а не как каталог, и падает с
`MODULE_NOT_FOUND`. Везде используется голый `node --test` с авто-обнаружением;
`package.json` и документация исправлены.

**Подмножество latin-ext не нужно.** План утверждал обратное — что без него
рассыплются `Türkiye`, `Côte d’Ivoire`, `Curaçao`, `Åland Islands`. Проверка
всех 280 английских названий регионов из ICU против реального `unicode-range`
показала, что это неверно: диакритика живёт в U+0000-00FF, а типографский
апостроф из `Côte d’Ivoire` — в U+2000-206F, и оба диапазона входят в `latin`.
Первая версия проверки давала ложный ответ, потому что прерывала цикл на первом
же не-ASCII символе и до апострофа не доходила. `latin-ext` стоил бы 182 KB
ради нуля видимых глифов. Решение закреплено тестом «unicode-range покрывает
все английские названия регионов и строки страницы».

**Inter — вариативный шрифт.** Google отдаёт один файл на веса 400 и 500, и
план скачивал его дважды под разными именами. Скрипт теперь группирует по URL и
выпускает один `@font-face` с диапазоном `font-weight: 400 500`. Вместо шести
файлов на 292 KB — два на 61.5 KB: `inter-latin.woff2` и
`space-grotesk-latin.woff2`. Запасной вариант «убрать Inter 500» не понадобился.

**Лицензий две, а не одна.** Space Grotesk и Inter — разные правообладатели,
поэтому рядом лежат `OFL.txt` и `OFL-SpaceGrotesk.txt`.

**Дефект в тесте фрагмента nginx.** Проверка «каждый `location` несёт свои
заголовки» разбивала файл по слову `location`, которое встречается и в
комментариях, — три ложных срабатывания. Тест теперь убирает комментарии до
разбора. Сам фрагмент был верен.

**Иконки.** `file:` протокол в headless-браузере заблокирован, поэтому для
отрисовки поднимался временный статический сервер. Снимались скриншоты
элементов (а не вьюпорта): так размер PNG задаётся точно.

**Ветка.** Работа велась прямо в `main` по требованию заказчика.
