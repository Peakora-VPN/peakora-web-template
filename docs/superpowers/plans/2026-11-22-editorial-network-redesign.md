# Peakora Network Editorial Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Полностью переработать публичный шаблон Peakora Network в цельный редакционный атлас сети, добавить каталог Field notes и точные метаданные без нарушения приватности, CSP и статической сборки.

**Architecture:** Сохранить общий `src/layout.html`, автономные страницы в `src/pages/` и сборку без зависимостей. Вся новая визуальная система живёт в `src/styles.css`; существующие `wireTabs`, `applyConnection`, `applyNode` и `wireCopyButtons` продолжают работать через прежние DOM-ID и data-атрибуты.

**Tech Stack:** HTML5, CSS, локальный SVG, ES modules, Node.js 20+ test runner, nginx static hosting.

## Global Constraints

- Работать в текущей ветке; не создавать ветку или worktree.
- Ноль внешних по origin запросов, зависимостей, аналитики, cookie, storage, форм и отправки данных.
- Ни inline `<script>`, ни атрибутов `style=`; CSP остаётся `default-src 'self'` с существующими уточнениями.
- Не публиковать hostname, список узлов, реальную карту, количество локаций или выдуманные показатели.
- Тексты только английские; тема только тёмная; контакт только через `{{CONTACT}}`.
- Синий `#6a8bff` — структура и ссылки; бирюзовый `#37e0c9` — только живые измерения.
- Сохранить DOM-ID из `tests/markup.test.mjs`, data-атрибуты вкладок и no-JS содержимое.
- Сохранить `noindex, nofollow`, `Disallow: /`, `X-Robots-Tag` и существующие security headers.
- Не добавлять canonical, og:url, og:image, sitemap, manifest, keywords, generator или security.txt.
- Сохранить бюджеты: `index.html` ≤ 30 KB, шрифты ≤ 100 KB, весь `dist` ≤ 250 KB.
- Использовать голый `node --test`, не `node --test tests/`.

---

### Task 1: Типы Open Graph и явные размеры иконок

**Files:**
- Modify: `src/layout.html`
- Modify: `build.mjs`
- Modify: `src/pages/name-resolution.html`
- Modify: `src/pages/connection-reuse.html`
- Modify: `src/pages/reading-timings.html`
- Test: `tests/markup.test.mjs`
- Test: `tests/dist.test.mjs`

**Interfaces:**
- Consumes: существующий ведущий metadata-комментарий и `parsePage()`.
- Produces: необязательное поле `type: article`; `{{OG_TYPE}}` заменяется на `article` или `website`.

- [ ] **Step 1: Добавить падающие проверки контракта**

В тест каркаса `tests/markup.test.mjs` добавить:

```js
assert.match(html, /<meta property="og:type" content="\{\{OG_TYPE\}\}"/);
assert.match(html, /<link rel="icon" type="image\/svg\+xml" sizes="any"/);
assert.match(html, /<link rel="alternate icon" type="image\/png" sizes="32x32"/);
assert.match(html, /<link rel="apple-touch-icon" sizes="180x180"/);
```

Добавить отдельный тест:

```js
test('статьи объявляют тип Open Graph, остальные страницы используют website', () => {
  for (const page of ['pages/name-resolution.html', 'pages/connection-reuse.html', 'pages/reading-timings.html']) {
    assert.match(metaBlock(page)[1], /^\s*type:\s*article\s*$/m, page);
  }
  for (const page of ['pages/index.html', 'pages/network.html', 'pages/404.html']) {
    assert.doesNotMatch(metaBlock(page)[1], /^\s*type:/m, page);
  }
});
```

В `tests/dist.test.mjs` добавить:

```js
test('собранные страницы получают правильный og:type', () => {
  for (const name of ['index.html', 'network/index.html', '404.html']) {
    assert.match(page(name), /<meta property="og:type" content="website"/);
  }
  for (const name of ['articles/name-resolution/index.html', 'articles/connection-reuse/index.html', 'articles/reading-timings/index.html']) {
    assert.match(page(name), /<meta property="og:type" content="article"/);
  }
});
```

- [ ] **Step 2: Запустить тесты и подтвердить причину падения**

Run: `node --test`

Expected: FAIL на отсутствии `{{OG_TYPE}}`, `sizes` и `type: article`; остальные падения не игнорировать.

- [ ] **Step 3: Реализовать метаданные**

В `src/layout.html` заменить строку `og:type` и ссылки иконок:

```html
    <meta property="og:type" content="{{OG_TYPE}}" />
    <meta property="og:site_name" content="Peakora Network" />
    <meta property="og:title" content="{{TITLE}}" />
    <meta property="og:description" content="{{DESCRIPTION}}" />
    <meta property="og:locale" content="en_US" />

    <link rel="icon" type="image/svg+xml" sizes="any" href="/favicon.svg" />
    <link rel="alternate icon" type="image/png" sizes="32x32" href="/favicon.png" />
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
```

В `build.mjs` в цепочку подстановок после `{{DESCRIPTION}}` добавить:

```js
    .split('{{OG_TYPE}}')
    .join(meta.type ?? 'website')
```

В ведущий комментарий каждой из трёх статей после `description` добавить:

```html
type: article
```

В проверку неразвёрнутых плейсхолдеров `tests/dist.test.mjs` добавить `{{OG_TYPE}}` в массив токенов.

- [ ] **Step 4: Проверить сборку и тесты**

Run: `node build.mjs && node --test`

Expected: PASS всех тестов; в собранных HTML нет `{{OG_TYPE}}`.

- [ ] **Step 5: Зафиксировать независимое изменение**

```bash
git add src/layout.html build.mjs src/pages/name-resolution.html src/pages/connection-reuse.html src/pages/reading-timings.html tests/markup.test.mjs tests/dist.test.mjs
git commit -m "feat: refine page social metadata"
```

---

### Task 2: Каталог Field notes и цельная навигация

**Files:**
- Create: `src/pages/articles.html`
- Modify: `src/layout.html`
- Modify: `src/pages/name-resolution.html`
- Modify: `src/pages/connection-reuse.html`
- Modify: `src/pages/reading-timings.html`
- Test: `tests/markup.test.mjs`
- Test: `tests/dist.test.mjs`

**Interfaces:**
- Consumes: `type` из Task 1, существующие URL статей и `{{CONTACT}}` не требуется.
- Produces: `/articles/`, `nav: notes`, пункт `data-nav="notes"`.

- [ ] **Step 1: Добавить падающие проверки каталога**

В `PAGES` обоих тестовых файлов добавить исходник или результат каталога:

```js
// tests/markup.test.mjs
const PAGES = ['pages/index.html', 'pages/network.html', 'pages/articles.html', 'pages/404.html'];
```

```js
// tests/dist.test.mjs, сразу после network/index.html
'articles/index.html',
```

В `tests/markup.test.mjs` расширить тест навигации:

```js
assert.ok(outs.has('articles/index.html'), 'нет страницы /articles/');
assert.match(layout, /href="\/articles\/" data-nav="notes"/, 'в навигации нет Field notes');
```

В `tests/dist.test.mjs` добавить:

```js
test('каталог Field notes связывает все статьи и отмечает активный раздел', () => {
  const catalog = page('articles/index.html');
  assert.match(catalog, /<title>Field notes — Peakora Network<\/title>/);
  assert.match(catalog, /data-nav="notes" aria-current="page"/);
  for (const path of ['/articles/name-resolution/', '/articles/connection-reuse/', '/articles/reading-timings/']) {
    assert.ok(catalog.includes(`href="${path}"`), `каталог не ссылается на ${path}`);
  }
  assert.ok(catalog.includes('href="/network/"'));
});
```

- [ ] **Step 2: Подтвердить падение до создания страницы**

Run: `node --test`

Expected: FAIL из-за отсутствия `articles/index.html` и пункта Field notes.

- [ ] **Step 3: Создать законченную страницу каталога**

Создать `src/pages/articles.html`:

```html
<!--
title: Field notes — Peakora Network
description: Practical notes on name resolution, connection setup, reuse and the timings that describe a web response.
out: articles/index.html
nav: notes
-->
      <section class="band band-hero editorial-hero">
        <div class="wrap band-grid">
          <p class="rail-label">Peakora Network / Field notes</p>
          <div class="band-body">
            <p class="hero-kicker mono">Notes from the request path</p>
            <h1>Read the network<br />one layer at a time.</h1>
            <p class="lede">A short reading series about the systems behind a page load: how a name becomes an address, why a second connection can skip setup and what response timings actually describe.</p>
            <p class="band-more"><a href="/network/">Open the complete network guide</a></p>
          </div>
        </div>
      </section>

      <section class="band" aria-labelledby="notes-title">
        <div class="wrap band-grid">
          <p class="rail-label">01 / Reading series</p>
          <div class="band-body">
            <h2 id="notes-title">Three notes. One continuous path.</h2>
            <p class="lede">Read in order for the complete journey, or open the question that brought you here.</p>
            <ol class="note-list">
              <li>
                <p class="note-number mono">01 / Names</p>
                <div><h3><a href="/articles/name-resolution/">Name resolution, from hostname to address</a></h3><p>Follow a lookup through browser, operating system and resolver caches. Understand why a cached answer leaves no DNS interval to measure.</p><a class="text-link" href="/articles/name-resolution/">Read name resolution</a></div>
              </li>
              <li>
                <p class="note-number mono">02 / Connections</p>
                <div><h3><a href="/articles/connection-reuse/">Connection reuse and the quiet second visit</a></h3><p>See what a fresh transport and secure handshake must establish, and why reuse removes setup rather than hiding it.</p><a class="text-link" href="/articles/connection-reuse/">Read connection reuse</a></div>
              </li>
              <li>
                <p class="note-number mono">03 / Measurements</p>
                <div><h3><a href="/articles/reading-timings/">Reading timings without overreading them</a></h3><p>Separate waiting for the first byte from transferring the response, and give one browser measurement the context it needs.</p><a class="text-link" href="/articles/reading-timings/">Read reading timings</a></div>
              </li>
            </ol>
          </div>
        </div>
      </section>

      <section class="band" aria-labelledby="notes-context-title">
        <div class="wrap band-grid">
          <p class="rail-label">02 / Wider context</p>
          <div class="band-body editorial-split">
            <div><h2 id="notes-context-title">A note answers one question. The guide connects them.</h2></div>
            <div><p>The Network guide places these details alongside transport negotiation, HTTP delivery and operational context. It is the reference map; Field notes are the close readings.</p><p class="band-more"><a href="/network/">Explore the Network guide</a></p></div>
          </div>
        </div>
      </section>
```

- [ ] **Step 4: Подключить навигацию и принадлежность статей**

В основной навигации `src/layout.html` между Network и Contact вставить:

```html
          <a href="/articles/" data-nav="notes">Field notes</a>
```

В списке Site подвала перед тремя статьями вставить:

```html
            <li><a href="/articles/">Field notes</a></li>
```

В ведущих комментариях трёх статей заменить:

```html
nav: network
```

на:

```html
nav: notes
```

- [ ] **Step 5: Добавить стили списка каталога**

В `src/styles.css` перед секцией 404 добавить:

```css
.editorial-hero h1 { max-width: 13ch; }
.hero-kicker { margin: 0 0 1.5rem; color: var(--accent-2); }
.note-list { margin: 2rem 0 0; padding: 0; list-style: none; border-top: 1px solid var(--hair); }
.note-list li { display: grid; grid-template-columns: 10rem 1fr; gap: 2rem; padding: 2rem 0; border-bottom: 1px solid var(--hair); }
.note-number { margin: 0.35rem 0 0; color: var(--accent-2); }
.note-list h3 { margin-bottom: 0.75rem; font-size: clamp(1.25rem, 2.5vw, 1.75rem); }
.note-list h3 a { color: var(--text); text-decoration: none; }
.note-list h3 a:hover { color: var(--accent-2); }
.note-list p:not(.note-number) { max-width: 62ch; margin: 0 0 1rem; color: var(--text-dim); }
.editorial-split { display: grid; grid-template-columns: 1fr 1fr; gap: 3rem; }
.editorial-split p { color: var(--text-dim); }
@media (max-width: 40rem) {
  .note-list li, .editorial-split { grid-template-columns: 1fr; gap: 1rem; }
}
```

- [ ] **Step 6: Проверить результат**

Run: `node build.mjs && node --test`

Expected: PASS; `/articles/` собирается, все ссылки существуют, у статей активен Field notes.

- [ ] **Step 7: Зафиксировать каталог**

```bash
git add src/pages/articles.html src/layout.html src/pages/name-resolution.html src/pages/connection-reuse.html src/pages/reading-timings.html src/styles.css tests/markup.test.mjs tests/dist.test.mjs dist
git commit -m "feat: add field notes catalog"
```

---

### Task 3: Главная и новая дизайн-система

**Files:**
- Modify: `src/pages/index.html`
- Modify: `src/layout.html`
- Modify: `src/styles.css`
- Test: `tests/markup.test.mjs`
- Test: `tests/dist.test.mjs`

**Interfaces:**
- Consumes: существующие `wireTabs`, `applyConnection`, `applyNode`, `wireCopyButtons`.
- Produces: классы `site-shell`, `network-scene`, `chapter-head`, `layer-row`, `note-card`, `contact-guide`; неизменные DOM-ID и data-атрибуты.

- [ ] **Step 1: Обновить структурные тесты до новой главной**

В `tests/markup.test.mjs` заменить проверку старого H1:

```js
assert.match(html, /<h1>Every request has a path\.<br\s*\/>Make it legible\.<\/h1>/);
assert.match(html, /class="network-scene"/);
assert.match(html, /aria-label="The path of a web request"/);
assert.match(html, /href="\/articles\/"/);
```

Добавить тест содержательной структуры:

```js
test('главная связывает инфраструктуру, измерение, статьи и контакт', () => {
  const html = read('pages/index.html');
  for (const id of ['request-path', 'infrastructure', 'technical-notes', 'field-notes', 'contact']) {
    assert.ok(html.includes(`id="${id}"`), `нет раздела ${id}`);
  }
  assert.equal([...html.matchAll(/data-tab-list[^>]*hidden/g)].length, 2);
  assert.ok(html.indexOf('id="request-path"') < html.indexOf('id="infrastructure"'));
  assert.ok(html.indexOf('id="infrastructure"') < html.indexOf('id="technical-notes"'));
  assert.ok(html.indexOf('id="technical-notes"') < html.indexOf('id="field-notes"'));
  assert.ok(html.indexOf('id="field-notes"') < html.indexOf('id="contact"'));
});
```

Существующий тест семи вкладочных панелей и все DOM-ID оставить без изменений.

- [ ] **Step 2: Подтвердить падение**

Run: `node --test`

Expected: FAIL на новом H1, `network-scene` и новых ID; тесты JS должны оставаться зелёными.

- [ ] **Step 3: Заменить hero главной законченной композицией**

В `src/pages/index.html` заменить текущий `section.band-hero` целиком:

```html
      <section class="band band-hero home-hero">
        <div class="wrap hero-grid">
          <div class="hero-copy">
            <p class="rail-label">Peakora Network / Edge infrastructure</p>
            <h1>Every request has a path.<br />Make it legible.</h1>
            <p class="lede">Delivery, transport and operations meet at the network boundary. Peakora Network approaches them as one connected system.</p>
            <p class="hero-description">Follow a request from its first name lookup to the final response, then inspect the timing your own browser reports for this page.</p>
            <div class="hero-actions">
              <a class="button" href="#infrastructure">Explore the infrastructure</a>
              <a class="text-link" href="/network/">Read the network guide</a>
            </div>
          </div>
          <div class="network-scene" role="img" aria-label="The path of a web request">
            <p class="scene-title mono">A request, in four movements</p>
            <ol class="scene-route">
              <li><span class="scene-node mono">01</span><div><strong>Resolve</strong><small>A name becomes an address</small></div></li>
              <li><span class="scene-node mono">02</span><div><strong>Connect</strong><small>A transport and secure channel open</small></div></li>
              <li><span class="scene-node mono">03</span><div><strong>Request</strong><small>The server prepares a response</small></div></li>
              <li><span class="scene-node mono">04</span><div><strong>Deliver</strong><small>The response returns to the browser</small></div></li>
            </ol>
            <p class="scene-foot">One continuous path. Different responsibilities at every stage.</p>
          </div>
        </div>
      </section>
```

- [ ] **Step 4: Перестроить содержание главной без потери JS-точек привязки**

Сохранить две группы вкладок с их семью панелями и исходными ID. Применить следующую структуру:

1. `section#request-path`: перенести существующий `aside.network-visual` внутрь обычного `div`, сохранив `data-tabs`, все кнопки, панели и ссылку Network.
2. `section#infrastructure`: сохранить существующие `tab-delivery`, `tab-routing`, `tab-operations`, панели и `area-points`; заменить вводный текст на:

```html
            <p class="chapter-index mono">02 / The working layers</p>
            <h2 id="infrastructure-title">Different responsibilities. One delivery system.</h2>
            <p class="lede">The edge handles the client-facing boundary. Routing determines the path between endpoints. Operations keeps changes and observations understandable over time.</p>
```

3. `section#technical-notes`: сохранить весь существующий instrument и `details.connection-details`; добавить перед regional note:

```html
            <p class="chapter-index mono">03 / One real observation</p>
            <h2>See what this page load exposed.</h2>
            <p class="lede">These are measurements from your browser, not a synthetic status badge. Open the note to inspect only the phases reported for this navigation.</p>
```

4. Добавить `section#field-notes` перед FAQ:

```html
      <section class="band" id="field-notes" aria-labelledby="field-notes-title">
        <div class="wrap band-grid">
          <p class="rail-label">04 / Field notes</p>
          <div class="band-body">
            <div class="section-heading"><div><h2 id="field-notes-title">Go one layer deeper.</h2><p class="lede">Three close readings of the systems behind a request.</p></div><a class="text-link" href="/articles/">All field notes</a></div>
            <div class="grid note-cards">
              <article class="note-card"><p class="mono">01 / Names</p><h3><a href="/articles/name-resolution/">A name is a question.</a></h3><p>How caches shorten resolution and why a lookup may be invisible in a page load.</p></article>
              <article class="note-card"><p class="mono">02 / Connections</p><h3><a href="/articles/connection-reuse/">Setup is a toll, not a destination.</a></h3><p>What a fresh connection establishes and what a reused one can skip.</p></article>
              <article class="note-card"><p class="mono">03 / Measurements</p><h3><a href="/articles/reading-timings/">One response, two clocks.</a></h3><p>Why waiting and transferring answer different questions about delivery.</p></article>
            </div>
          </div>
        </div>
      </section>
```

5. Объединить старые Operating principles и Common questions в один FAQ с пятью практическими вопросами: meaning of edge, differences between visits, missing phases, useful measurements, reporting an issue. Сохранить native `<details>`.
6. В `#contact` сохранить существующие ссылку и кнопку, добавив рядом:

```html
            <div class="contact-guide">
              <p class="mono">A useful incident report includes</p>
              <ul><li>The affected hostname or address</li><li>Timestamps in UTC</li><li>What you expected and what happened</li><li>Whether the behavior repeats and who it affects</li></ul>
            </div>
```

7. Обновить ведущий `description` на `Explore the layers of edge delivery, follow a web request and inspect the real timing reported by your browser.`.

- [ ] **Step 5: Заменить визуальную основу CSS**

Сохранить `@font-face`, токены, instrument, path, FAQ и media fallback. Заменить базовые композиционные стили следующей системой:

```css
:root {
  --wrap: 1240px;
  --section-space: clamp(4.5rem, 9vw, 8rem);
  --grid-line: rgba(106, 139, 255, 0.09);
}
html { background: var(--bg); }
body { background-image: linear-gradient(var(--grid-line) 1px, transparent 1px), linear-gradient(90deg, var(--grid-line) 1px, transparent 1px); background-size: 72px 72px; background-position: center top; }
.wrap { width: min(var(--wrap), 100% - 3rem); }
.site-head { background: rgba(7, 11, 22, 0.92); }
.head-inner { min-height: 76px; padding-block: 0.75rem; }
.site-nav { align-items: center; gap: clamp(0.8rem, 2vw, 1.75rem); }
.site-nav a { min-height: 40px; display: inline-flex; align-items: center; }
.band-grid { padding-block: var(--section-space); }
.band-hero .band-grid, .hero-grid { padding-block: clamp(4rem, 8vw, 7rem); }
.band + .band .band-grid { border-top-color: var(--border); }
.chapter-index { margin: 0 0 1rem; color: var(--accent-2); }
.section-heading { display: flex; justify-content: space-between; align-items: end; gap: 2rem; }
.section-heading .lede { margin-bottom: 0; }
.home-hero { position: relative; overflow: hidden; }
.home-hero::after { content: ""; position: absolute; inset: auto 0 0; height: 1px; background: linear-gradient(90deg, transparent, var(--accent-2), transparent); opacity: 0.45; }
.home-hero .hero-grid { grid-template-columns: minmax(0, 1.08fr) minmax(22rem, 0.92fr); }
.hero-copy h1 { max-width: 12ch; font-size: clamp(3rem, 6.2vw, 5.8rem); line-height: 0.96; }
.network-scene { position: relative; padding: clamp(1.5rem, 3vw, 2.5rem); border: 1px solid var(--border); background: rgba(11, 18, 36, 0.72); }
.network-scene::before { content: ""; position: absolute; inset: 0; pointer-events: none; background: linear-gradient(135deg, rgba(106,139,255,0.1), transparent 55%); }
.scene-title { position: relative; margin: 0 0 2rem; color: var(--accent-2); }
.scene-route { position: relative; margin: 0; padding: 0; list-style: none; }
.scene-route li { position: relative; display: grid; grid-template-columns: 3rem 1fr; gap: 1.25rem; padding-bottom: 2rem; }
.scene-route li:not(:last-child)::after { content: ""; position: absolute; left: 1.45rem; top: 3rem; bottom: 0; width: 1px; background: var(--accent-2); opacity: 0.35; }
.scene-node { position: relative; z-index: 1; display: grid; place-items: center; width: 3rem; height: 3rem; border: 1px solid var(--accent-2); border-radius: 50%; background: var(--bg-2); color: var(--accent-2); }
.scene-route strong { display: block; font: 600 1.125rem var(--font-display); }
.scene-route small { display: block; margin-top: 0.3rem; color: var(--text-dim); }
.scene-foot { position: relative; margin: 0; padding-top: 1.5rem; border-top: 1px solid var(--hair); color: var(--text-dim); font-size: 0.8125rem; }
.note-card { padding: 1.75rem 0; border-top: 2px solid var(--accent-2); }
.note-card > .mono { margin: 0 0 2.5rem; color: var(--accent-2); }
.note-card h3 a { color: var(--text); text-decoration: none; }
.note-card p:last-child { color: var(--text-dim); }
.contact-guide { margin-top: 2.5rem; padding: 1.5rem; border-left: 2px solid var(--accent-2); background: rgba(106,139,255,0.06); }
.contact-guide > p { margin: 0; color: var(--accent-2); }
.contact-guide ul { margin: 1rem 0 0; padding-left: 1.25rem; color: var(--text-dim); }
@media (max-width: 56rem) {
  .home-hero .hero-grid { grid-template-columns: 1fr; }
  .hero-copy h1 { max-width: 14ch; }
  .section-heading { align-items: start; flex-direction: column; }
}
@media (max-width: 40rem) {
  .wrap { width: calc(100% - 2rem); }
  .head-inner { align-items: flex-start; }
  .site-nav { width: 100%; justify-content: space-between; overflow-x: auto; }
  .site-nav a { flex: none; }
  .home-hero .hero-grid { padding-block: 3rem; }
  .hero-copy h1 { font-size: clamp(2.65rem, 13vw, 4rem); }
  body { background-size: 48px 48px; }
}
```

Удалить перекрывающие старые правила `.hero-grid`, `.network-visual`, `.note-card` и повторные mobile-правила, чтобы каскад не зависел от случайного порядка. Не менять CSSOM-запись измерений в `app.js`.

- [ ] **Step 6: Обновить подвал под новую архитектуру**

В `src/layout.html` заменить описание бренда:

```html
          <p>Edge delivery, routing and operations — explained as connected parts of one request path.</p>
```

Список Site должен содержать Overview, Infrastructure, Network, Field notes и Contact. Отдельные три статьи оставить только в Field notes, чтобы подвал не дублировал весь каталог.

- [ ] **Step 7: Проверить главную и регрессии**

Run: `node build.mjs && node --test`

Expected: PASS; семь панелей вкладок остаются, все старые DOM-ID присутствуют, размеры в бюджете.

- [ ] **Step 8: Зафиксировать редизайн главной**

```bash
git add src/pages/index.html src/layout.html src/styles.css tests/markup.test.mjs tests/dist.test.mjs dist
git commit -m "feat: redesign network overview"
```

---

### Task 4: Network как технический справочник

**Files:**
- Modify: `src/pages/network.html`
- Modify: `src/styles.css`
- Test: `tests/markup.test.mjs`
- Test: `tests/dist.test.mjs`

**Interfaces:**
- Consumes: общие band, path, grid, editorial-split и note-card из Tasks 2–3.
- Produces: якоря `#resolve`, `#connect`, `#secure`, `#request`, `#deliver`, `#signals`; класс `guide-contents`.

- [ ] **Step 1: Добавить падающий тест справочника**

В `tests/markup.test.mjs`:

```js
test('Network — связанный справочник с рабочим содержанием', () => {
  const html = read('pages/network.html');
  assert.match(html, /<nav class="guide-contents" aria-label="Network guide contents">/);
  for (const id of ['resolve', 'connect', 'secure', 'request', 'deliver', 'signals']) {
    assert.ok(html.includes(`id="${id}"`), `нет главы ${id}`);
    assert.ok(html.includes(`href="#${id}"`), `содержание не ссылается на ${id}`);
  }
  for (const path of ['/articles/name-resolution/', '/articles/connection-reuse/', '/articles/reading-timings/', '/articles/']) {
    assert.ok(html.includes(`href="${path}"`), `нет перехода ${path}`);
  }
});
```

- [ ] **Step 2: Подтвердить падение**

Run: `node --test`

Expected: FAIL только на новом контракте Network.

- [ ] **Step 3: Переписать Network с законченной навигацией по главам**

Обновить hero:

```html
      <section class="band band-hero guide-hero">
        <div class="wrap band-grid">
          <p class="rail-label">Peakora Network / Network guide</p>
          <div class="band-body">
            <p class="hero-kicker mono">Reference / The request path</p>
            <h1>Inside the request path.</h1>
            <p class="lede">A practical reference to names, connections, secure transport, HTTP and response delivery — with the boundaries of what one browser measurement can tell you.</p>
          </div>
        </div>
      </section>
```

Сразу после hero добавить:

```html
      <section class="band guide-intro" aria-label="Guide navigation">
        <div class="wrap band-grid">
          <p class="rail-label">Contents</p>
          <div class="band-body">
            <nav class="guide-contents" aria-label="Network guide contents">
              <a href="#resolve"><span>01</span>Resolve a name</a>
              <a href="#connect"><span>02</span>Open a connection</a>
              <a href="#secure"><span>03</span>Secure the channel</a>
              <a href="#request"><span>04</span>Send the request</a>
              <a href="#deliver"><span>05</span>Deliver the response</a>
              <a href="#signals"><span>06</span>Read the signals</a>
            </nav>
          </div>
        </div>
      </section>
```

Создать пять глав в этом порядке, используя существующий технический текст и следующие обязательные заголовки и связи:

```html
<section class="band guide-chapter" id="resolve" aria-labelledby="resolve-title"><div class="wrap band-grid"><p class="rail-label">01 / Resolve</p><div class="band-body"><h2 id="resolve-title">A hostname becomes an address.</h2><p class="lede">DNS connects a memorable name to a usable address. Browser, operating system and resolver caches can answer before a new network lookup is needed.</p><p>A missing DNS phase can therefore mean a useful cached answer, not missing information about the page.</p><p class="band-more"><a href="/articles/name-resolution/">Read the name resolution note</a></p></div></div></section>
<section class="band guide-chapter" id="connect" aria-labelledby="connect-title"><div class="wrap band-grid"><p class="rail-label">02 / Connect</p><div class="band-body"><h2 id="connect-title">The endpoints establish a transport.</h2><p class="lede">A fresh connection must open before application data can move. A reused connection continues an existing channel and skips that setup.</p><p>Navigation Timing can expose connection boundaries, but the visible phases depend on the transport and on whether setup actually happened.</p><p class="band-more"><a href="/articles/connection-reuse/">Read the connection reuse note</a></p></div></div></section>
<section class="band guide-chapter" id="secure" aria-labelledby="secure-title"><div class="wrap band-grid"><p class="rail-label">03 / Secure</p><div class="band-body"><h2 id="secure-title">The channel negotiates protection.</h2><p class="lede">For a secure connection, the endpoints authenticate and agree on encryption parameters before relying on the channel.</p><p>The secure handshake belongs to the connection. It is distinct from HTTP, which describes the requests and responses carried inside it.</p></div></div></section>
<section class="band guide-chapter" id="request" aria-labelledby="request-title"><div class="wrap band-grid"><p class="rail-label">04 / Request</p><div class="band-body"><h2 id="request-title">Waiting for the first byte has more than one cause.</h2><p class="lede">Time to first byte begins with the request and ends when the response starts arriving. Network travel and response preparation both belong to this interval.</p><p>TTFB identifies how long the wait was; by itself it cannot identify which component made the wait long.</p></div></div></section>
<section class="band guide-chapter" id="deliver" aria-labelledby="deliver-title"><div class="wrap band-grid"><p class="rail-label">05 / Deliver</p><div class="band-body"><h2 id="deliver-title">The response arrives. The page may still be assembling.</h2><p class="lede">Transfer time runs from the first response byte to the last for this document. Styles, fonts and other resources are separate exchanges.</p><p>A document transfer is not a bandwidth test and does not describe the time needed to render the complete page.</p><p class="band-more"><a href="/articles/reading-timings/">Read the timing note</a></p></div></div></section>
```

В `#signals` сохранить четыре карточки о fresh/reused, document/page, waiting/transfer и sample/pattern, добавив переходы на измерение главной и каталог:

```html
            <p class="band-more"><a href="/#technical-notes">Inspect this page load</a> · <a href="/articles/">Browse all field notes</a></p>
```

FAQ сохранить после `#signals`; удалить повторяющийся блок Further reading, потому что ссылки теперь стоят в соответствующих главах.

- [ ] **Step 4: Добавить стили справочника**

```css
.guide-hero h1 { max-width: 12ch; }
.guide-intro .band-grid { padding-block: 2rem; }
.guide-contents { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border-top: 1px solid var(--hair); }
.guide-contents a { display: flex; gap: 0.75rem; padding: 1.25rem 0; border-bottom: 1px solid var(--hair); color: var(--text); text-decoration: none; }
.guide-contents a:hover { color: var(--accent-2); }
.guide-contents span { color: var(--accent-2); font-family: var(--font-mono); font-size: 0.75rem; }
.guide-chapter .band-body { max-width: 52rem; }
@media (max-width: 40rem) { .guide-contents { grid-template-columns: 1fr 1fr; } }
```

- [ ] **Step 5: Проверить справочник**

Run: `node build.mjs && node --test`

Expected: PASS; все якоря и внутренние ссылки существуют, прежние тесты связности статей остаются зелёными.

- [ ] **Step 6: Зафиксировать справочник**

```bash
git add src/pages/network.html src/styles.css tests/markup.test.mjs tests/dist.test.mjs dist
git commit -m "feat: turn network page into a reference guide"
```

---

### Task 5: Единый редакционный формат статей

**Files:**
- Modify: `src/pages/name-resolution.html`
- Modify: `src/pages/connection-reuse.html`
- Modify: `src/pages/reading-timings.html`
- Modify: `src/styles.css`
- Test: `tests/markup.test.mjs`
- Test: `tests/dist.test.mjs`

**Interfaces:**
- Consumes: `nav: notes`, `type: article`, `/articles/` из Tasks 1–2.
- Produces: `article-hero`, `article-kicker`, `article-next`; прежние URL и ID содержимого не меняются.

- [ ] **Step 1: Добавить падающие проверки принадлежности и переходов**

В `tests/markup.test.mjs`:

```js
test('статьи образуют последовательность Field notes', () => {
  const articles = ['pages/name-resolution.html', 'pages/connection-reuse.html', 'pages/reading-timings.html'];
  for (const article of articles) {
    const html = read(article);
    assert.match(html, /class="band band-hero article-hero"/);
    assert.match(html, /href="\/articles\/"/);
    assert.match(html, /nav: notes/);
  }
  assert.match(read('pages/name-resolution.html'), /class="article-next"[\s\S]*?href="\/articles\/connection-reuse\/"/);
  assert.match(read('pages/connection-reuse.html'), /class="article-next"[\s\S]*?href="\/articles\/reading-timings\/"/);
  assert.match(read('pages/reading-timings.html'), /class="article-next"[\s\S]*?href="\/articles\/name-resolution\/"/);
});
```

В `tests/dist.test.mjs` добавить во все три статьи проверку `data-nav="notes" aria-current="page"` в существующий тест активных пунктов.

- [ ] **Step 2: Подтвердить падение**

Run: `node --test`

Expected: FAIL на `article-hero` и `article-next`.

- [ ] **Step 3: Применить общий hero к каждой статье**

Для name resolution заменить hero:

```html
      <section class="band band-hero article-hero">
        <div class="wrap band-grid">
          <p class="rail-label">Field notes / 01 / Names</p>
          <div class="band-body">
            <a class="article-kicker mono" href="/articles/">The request path reading series</a>
            <h1>A name is a question.</h1>
            <p class="lede">A hostname is easy for people to remember and useless for a machine to dial. Before any connection can start, the name has to be translated into an address, and every step of that translation is designed to happen as rarely as possible.</p>
          </div>
        </div>
      </section>
```

Для connection reuse использовать ту же структуру с рубрикой `Field notes / 02 / Connections`, сохранив существующие H1 и lede. Для reading timings использовать `Field notes / 03 / Measurements`, также сохранив существующие H1 и lede.

- [ ] **Step 4: Добавить законченные переходы между статьями**

В конец name resolution после Related reading добавить:

```html
      <section class="band article-next" aria-label="Next field note">
        <div class="wrap band-grid"><p class="rail-label">Next / 02</p><div class="band-body"><p class="mono">Connections</p><h2><a href="/articles/connection-reuse/">Setup is a toll, not a destination.</a></h2><p>Continue with the work a fresh connection performs and the setup a reused one avoids.</p></div></div>
      </section>
```

В конец connection reuse добавить:

```html
      <section class="band article-next" aria-label="Next field note">
        <div class="wrap band-grid"><p class="rail-label">Next / 03</p><div class="band-body"><p class="mono">Measurements</p><h2><a href="/articles/reading-timings/">One response, two clocks.</a></h2><p>Continue with the difference between waiting for a response and transferring it.</p></div></div>
      </section>
```

В конец reading timings добавить:

```html
      <section class="band article-next" aria-label="Return to the first field note">
        <div class="wrap band-grid"><p class="rail-label">Read again / 01</p><div class="band-body"><p class="mono">Names</p><h2><a href="/articles/name-resolution/">A name is a question.</a></h2><p>Return to the first stage and see how caching shapes everything that follows.</p></div></div>
      </section>
```

Существующие Related reading и техническое содержание сохранить; ссылку `Back to the network guide` дополнить ссылкой `/articles/` с текстом `All field notes`.

- [ ] **Step 5: Оформить редакционные переходы**

```css
.article-hero .band-body { max-width: 58rem; }
.article-hero h1 { max-width: 13ch; }
.article-kicker { display: inline-block; margin-bottom: 2rem; color: var(--accent-2); text-decoration: none; }
.article-next .band-grid { padding-block: 3.5rem; }
.article-next .band-body > .mono { color: var(--accent-2); }
.article-next h2 { max-width: 24ch; }
.article-next h2 a { color: var(--text); text-decoration: none; }
.article-next h2 a:hover { color: var(--accent-2); }
.article-next .band-body > p:last-child { max-width: 55ch; color: var(--text-dim); }
```

- [ ] **Step 6: Проверить серию**

Run: `node build.mjs && node --test`

Expected: PASS; статьи активируют Field notes, связаны с каталогом и друг с другом, сохраняют `og:type=article`.

- [ ] **Step 7: Зафиксировать формат статей**

```bash
git add src/pages/name-resolution.html src/pages/connection-reuse.html src/pages/reading-timings.html src/styles.css tests/markup.test.mjs tests/dist.test.mjs dist
git commit -m "feat: unify field notes presentation"
```

---

### Task 6: Полезная 404, документация и сквозная проверка

**Files:**
- Modify: `src/pages/404.html`
- Modify: `src/styles.css`
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `docs/superpowers/specs/2026-11-22-editorial-network-redesign-design.md`
- Test: `tests/markup.test.mjs`
- Test: `tests/dist.test.mjs`

**Interfaces:**
- Consumes: все публичные URL из Tasks 2–5.
- Produces: законченный сайт, синхронная документация и собранный `dist/`.

- [ ] **Step 1: Добавить падающий тест полезной 404**

В `tests/markup.test.mjs` расширить тест 404:

```js
for (const href of ['href="/network/"', 'href="/articles/"', 'href="/#contact"']) {
  assert.ok(html.includes(href), `404 не содержит ${href}`);
}
```

- [ ] **Step 2: Подтвердить падение**

Run: `node --test`

Expected: FAIL только на новых ссылках 404.

- [ ] **Step 3: Завершить 404**

Заменить содержимое `src/pages/404.html` после ведущего комментария:

```html
      <section class="band band-hero notfound-hero">
        <div class="wrap band-grid">
          <p class="rail-label">Peakora Network / 404</p>
          <div class="band-body">
            <p class="notfound-code mono">404 / Outside the map</p>
            <h1>Nothing at this path.</h1>
            <p class="lede">The address does not belong to a page on this host. Return to the overview or continue through the network reference.</p>
            <nav class="notfound-links" aria-label="Useful destinations">
              <a href="/">Overview</a><a href="/network/">Network guide</a><a href="/articles/">Field notes</a><a href="/#contact">Contact</a>
            </nav>
          </div>
        </div>
      </section>
```

Добавить CSS:

```css
.notfound-hero .band-grid { min-height: 55vh; align-content: center; }
.notfound-links { display: flex; flex-wrap: wrap; gap: 1rem 1.5rem; margin-top: 2rem; }
.notfound-links a { text-underline-offset: 5px; }
```

- [ ] **Step 4: Синхронизировать документацию**

В `README.md` обновить таблицу страниц:

```markdown
| `/` | Редакционный обзор инфраструктуры, путь запроса, измерения, Field notes, FAQ, контакт |
| `/network/` | Справочник с содержанием и главами о DNS, соединении, TLS, HTTP, доставке и измерениях |
| `/articles/` | Каталог Field notes и порядок чтения трёх технических заметок |
| `/articles/name-resolution/` | Name resolution и кэширование |
| `/articles/connection-reuse/` | Secure transport, setup и connection reuse |
| `/articles/reading-timings/` | Navigation Timing, TTFB и передача |
| `404` | Полезные переходы на основные разделы; отдаётся с HTTP 404 |
```

В `AGENTS.md` в обзоре страниц указать `/articles/`, активный `nav: notes` и `type: article`; в разделе сборки перечислить `{{OG_TYPE}}`. Обновить описание оформления: редакционная сетка и scene-route, без изменения правила цвета.

В статусе спецификации записать:

```markdown
Дата: 2026-11-22. Статус: реализовано и проверено.
```

- [ ] **Step 5: Выполнить стандартную сборку и полный набор тестов**

Run: `node build.mjs && node --test`

Expected: PASS всех тестов; отчёт сборки содержит шесть публичных HTML-страниц и `404.html`; `dist` ≤ 250 KB.

- [ ] **Step 6: Проверить реальные браузерные сценарии**

Использовать доступный локальный browser automation без добавления зависимостей в проект. Поднять только временный локальный сервер:

```bash
node -e "const http=require('node:http'),fs=require('node:fs'),path=require('node:path');const root=path.resolve('dist'),types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.txt':'text/plain; charset=utf-8'};http.createServer((req,res)=>{const p=decodeURIComponent(req.url.split('?')[0]);let f=path.join(root,p);if(p.endsWith('/'))f=path.join(f,'index.html');fs.readFile(f,(e,d)=>{if(e){res.statusCode=404;res.setHeader('Content-Type',types['.html']);fs.readFile(path.join(root,'404.html'),(_,x)=>res.end(x));}else{res.setHeader('Content-Type',types[path.extname(f)]||'application/octet-stream');res.end(d);}});}).listen(4173,'127.0.0.1');"
```

Проверить реальными действиями:

```text
1. Открыть / на 1440×1000: hero, scene-route, все разделы и footer видны без горизонтального overflow.
2. Нажать Connect, Request, Deliver в первой группе; затем Routing и Operations во второй. Состояния групп независимы.
3. На первой вкладке нажать End, Home, ArrowLeft и ArrowRight; фокус и aria-selected меняются согласованно.
4. Открыть Technical notes: присутствуют только реальные фазы, turquoise относится только к измерениям.
5. Нажать Copy: подпись меняется на Copied только при успешном разрешении Clipboard API.
6. Открыть /network/, пройти все шесть ссылок contents; заголовки не скрываются под sticky header.
7. Открыть /articles/, затем все три статьи и article-next; активный пункт остаётся Field notes.
8. Открыть несуществующий URL: получить HTTP 404 и четыре рабочих перехода.
9. Повторить / и /articles/ на 390×844: навигация доступна, текст не обрезан, схема читается, overflow отсутствует.
10. Отключить JS: обе группы панелей читаются последовательно, tab buttons и Copy скрыты, email остаётся ссылкой.
11. Эмулировать prefers-reduced-motion: aurora и transition шкалы отключены.
12. Проверить Network log: все ресурсы same-origin; нет analytics, storage, fetch и внешних запросов.
```

Если browser automation недоступен, не объявлять визуальную проверку выполненной: перечислить непроверенные пункты в финальном отчёте. Временный сервер остановить, скриншоты и логи удалить после проверки.

- [ ] **Step 7: Проверить итоговый набор файлов**

Run: `git status --short`

Expected: только предусмотренные исходники, тесты, документация и пересобранный `dist/`; нет временных логов, скриншотов, `node_modules` или новых конфигурационных файлов.

- [ ] **Step 8: Зафиксировать завершение**

```bash
git add src/pages/404.html src/styles.css README.md AGENTS.md docs/superpowers/specs/2026-11-22-editorial-network-redesign-design.md tests/markup.test.mjs tests/dist.test.mjs dist
git commit -m "feat: complete editorial network redesign"
```
