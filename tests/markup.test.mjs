import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const read = (name) => readFileSync(SRC + name, 'utf8');

const PAGES = [
  'pages/index.html',
  'pages/network.html',
  'pages/articles.html',
  'pages/name-resolution.html',
  'pages/connection-reuse.html',
  'pages/reading-timings.html',
  'pages/404.html',
];
const HTML = ['layout.html', ...PAGES];
const ALL = [...HTML, 'assets/styles.css', 'assets/app.js', 'assets/lib.js', 'assets/logo.svg'];
const FORBIDDEN = [
  'vpn', 'proxy', 'xray', 'reality', 'remnawave',
  'marzban', 'shadowsocks', 'vless', 'trojan',
];

test('каркас объявляет метаданные и серверные точки подстановки', () => {
  const html = read('layout.html');
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<meta charset="utf-8"/);
  assert.match(html, /<meta name="viewport"/);
  assert.match(html, /<meta name="description" content="\{\{ description \}\}"/);
  assert.match(html, /<meta name="robots" content="noindex, nofollow"/);
  assert.match(html, /<meta property="og:type" content="\{\{ og_type \}\}"/);
  assert.match(html, /<title>\{\{ title \}\}<\/title>/);
  assert.doesNotMatch(html, /<meta name="generator"/);
  for (const token of ['{% block content %}', '{{ year }}', '{{ contact }}', '{% include "assets/logo.svg" %}']) {
    assert.ok(html.includes(token), `нет ${token}`);
  }
});

test('каждая страница расширяет общий каркас и объявляет content block', () => {
  for (const page of PAGES) {
    const html = read(page);
    assert.ok(html.startsWith('{% extends "layout.html" %}\n{% block content %}'), page);
    assert.ok(html.endsWith('{% endblock %}\n'), page);
  }
});

test('навигация каркаса ведёт на существующие разделы', () => {
  const layout = read('layout.html');
  assert.match(layout, /href="\/network\/"/);
  assert.match(layout, /href="\/articles\/" data-nav="notes"/);
  assert.match(layout, /href="\/#contact"/);
  assert.match(layout, /nav == "overview"/);
  assert.match(layout, /nav == "network"/);
  assert.match(layout, /nav == "notes"/);
});

test('главная несёт точки привязки скрипта', () => {
  const html = read('pages/index.html');
  for (const id of ['node-location', 'infrastructure', 'technical-notes', 'connection', 'hs-track', 'hs-meta', 'hs-total', 'metric-ttfb', 'metric-transfer', 'metric-protocol', 'contact']) {
    assert.ok(html.includes(`id="${id}"`), `нет id="${id}"`);
  }
  assert.match(html, /data-copy="\{\{ contact \}\}"/);
});

test('публичная главная не превращается в карточку hostname', () => {
  const html = read('pages/index.html');
  assert.doesNotMatch(html, /id="(?:node-headline|node-hostname|node-code|copy-host)"/);
  assert.match(html, /<h1>Every request has a path\.<br\s*\/>Make it legible\.<\/h1>/);
  assert.match(html, /class="network-scene"/);
  assert.match(html, /aria-label="The path of a web request"/);
  assert.match(html, /href="\/articles\/"/);
  assert.match(html, /<details class="connection-details">/);
});

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

test('вкладки имеют существующие панели, скрытые до подключения скрипта кнопки и полный HTML-контент', () => {
  const html = read('pages/index.html');
  const panels = [...html.matchAll(/aria-controls="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(panels.length, 7);
  assert.equal(new Set(panels).size, 7);
  for (const id of panels) assert.match(html, new RegExp(`<section[^>]*id="${id}"[^>]*data-tab-panel>`));
  assert.equal([...html.matchAll(/data-tab-list[^>]*hidden/g)].length, 2);
  assert.doesNotMatch(html, /<section[^>]*data-tab-panel[^>]*hidden/);
});

test('контактный адрес нигде не вписан руками', () => {
  const site = JSON.parse(read('site.json'));
  assert.ok(site.contact, 'в site.json нет поля contact');
  for (const name of HTML) {
    assert.ok(!read(name).includes(site.contact), `${name}: адрес вписан вместо Jinja placeholder`);
  }
});

test('контакт — только mailto и копирование, формы обращения нет', () => {
  const html = read('pages/index.html');
  assert.doesNotMatch(html, /<dialog/);
  assert.doesNotMatch(html, /<form/);
  assert.doesNotMatch(html, /id="request-(?:composer|form|dialog|name|email|message)/);
  assert.doesNotMatch(html, /data-(?:open|close)-request/);
  assert.match(html, /<a class="contact-mail mono" href="mailto:\{\{ contact \}\}">\{\{ contact \}\}<\/a>/);
  assert.match(html, /<button class="copy mono"[^>]*data-copy="\{\{ contact \}\}"/);
});

test('контакт доступен без JS: ссылка видна, копирование — улучшение', () => {
  const html = read('pages/index.html');
  const link = html.match(/<a class="contact-mail mono"[^>]*>/)?.[0] ?? '';
  assert.ok(!/\shidden/.test(link));
  const copy = html.match(/<button class="copy mono"[^>]*>/)?.[0] ?? '';
  assert.match(copy, /\shidden/);
});

test('статьи образуют последовательность Field notes', () => {
  const articles = ['pages/name-resolution.html', 'pages/connection-reuse.html', 'pages/reading-timings.html'];
  for (const article of articles) {
    const html = read(article);
    assert.match(html, /class="band band-hero article-hero"/);
    assert.match(html, /href="\/articles\/"/);
  }
  assert.match(read('pages/name-resolution.html'), /class="band article-next"[\s\S]*?href="\/articles\/connection-reuse\/"/);
  assert.match(read('pages/connection-reuse.html'), /class="band article-next"[\s\S]*?href="\/articles\/reading-timings\/"/);
  assert.match(read('pages/reading-timings.html'), /class="band article-next"[\s\S]*?href="\/articles\/name-resolution\/"/);
});

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

test('404 не отмечает пункт меню и предлагает полезные переходы', () => {
  const html = read('pages/404.html');
  assert.ok(!html.includes('id="node-headline"'));
  assert.doesNotMatch(html, /aria-current/);
  for (const href of ['href="/network/"', 'href="/articles/"', 'href="/#contact"']) {
    assert.ok(html.includes(href), `404 не содержит ${href}`);
  }
});

test('разметка совместима с CSP: нет инлайнового скрипта и style=', () => {
  for (const name of HTML) {
    const html = read(name);
    assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/i, `${name}: инлайновый <script>`);
    assert.doesNotMatch(html, /\sstyle="/i, `${name}: атрибут style=`);
  }
});

test('в исходниках нет запрещённых слов', () => {
  for (const name of ALL) {
    const text = read(name).toLowerCase();
    for (const word of FORBIDDEN) {
      assert.ok(!text.includes(word), `${name} содержит «${word}»`);
    }
  }
});

test('стили определяют тёмную палитру и гасят анимацию по запросу', () => {
  const css = read('assets/styles.css');
  assert.match(css, /--bg:\s*#070b16/);
  assert.match(css, /--accent:\s*#37e0c9/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /--font-mono:\s*"JetBrains Mono"/);
});

test('CSS-блоки сбалансированы, подвал не оказывается внутри медиазапроса', () => {
  const css = read('assets/styles.css');
  assert.equal((css.match(/\{/g) ?? []).length, (css.match(/\}/g) ?? []).length);
  assert.match(css, /@media \(max-width: 30rem\) \{[\s\S]*?\n\}\n\n\/\* ── Articles/);
});

test('типографика и touch interaction следуют interface guidelines', () => {
  const css = read('assets/styles.css');
  assert.match(css, /h1,\s*h2,\s*h3\s*\{[^}]*text-wrap:\s*balance/);
  assert.match(css, /font-variant-numeric:\s*tabular-nums/);
  assert.match(css, /touch-action:\s*manipulation/);
  assert.match(css, /-webkit-tap-highlight-color:\s*rgba\(106,\s*139,\s*255,\s*0\.18\)/);
});
