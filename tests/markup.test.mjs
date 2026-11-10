import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const read = (name) => readFileSync(SRC + name, 'utf8');

const PAGES = ['pages/index.html', 'pages/network.html', 'pages/404.html'];
const HTML = ['layout.html', ...PAGES];
const ALL = [...HTML, 'styles.css', 'assets/logo.svg'];

const FORBIDDEN = [
  'vpn', 'proxy', 'xray', 'reality', 'remnawave',
  'marzban', 'shadowsocks', 'vless', 'trojan',
];

const metaBlock = (page) => read(page).match(/^\s*<!--([\s\S]*?)-->/);

test('каркас объявляет обязательные метаданные и точки подстановки', () => {
  const html = read('layout.html');
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<meta charset="utf-8"/);
  assert.match(html, /<meta name="viewport"/);
  assert.match(html, /<meta name="description" content="\{\{DESCRIPTION\}\}"/);
  assert.match(html, /<meta name="robots" content="noindex, nofollow"/);
  assert.match(html, /<title>\{\{TITLE\}\}<\/title>/);
  assert.doesNotMatch(html, /<meta name="generator"/);
  for (const token of ['{{CONTENT}}', '{{YEAR}}', '<!--LOGO-->']) {
    assert.ok(html.includes(token), `нет плейсхолдера ${token}`);
  }
});

test('у каждой страницы полный блок метаданных', () => {
  for (const page of PAGES) {
    const head = metaBlock(page);
    assert.ok(head, `${page}: нет ведущего блока метаданных`);
    for (const key of ['title', 'description', 'out']) {
      assert.match(head[1], new RegExp(`^\\s*${key}\\s*:\\s*\\S`, 'm'), `${page}: нет поля ${key}`);
    }
  }
});

test('навигация каркаса ведёт на страницы, которые действительно собираются', () => {
  const outs = new Set(PAGES.map((page) => metaBlock(page)[1].match(/^\s*out\s*:\s*(.+?)\s*$/m)[1]));
  assert.ok(outs.has('index.html'), 'нет главной');
  assert.ok(outs.has('network/index.html'), 'нет страницы /network/');
  assert.ok(outs.has('404.html'), 'нет страницы 404');

  const layout = read('layout.html');
  assert.match(layout, /href="\/network\/"/, 'в навигации нет ссылки на /network/');
  assert.match(layout, /href="\/#contact"/, 'ссылка на контакт должна работать с любой страницы');
});

test('главная несёт точки привязки скрипта', () => {
  const html = read('pages/index.html');
  for (const id of ['node-location', 'infrastructure', 'technical-notes', 'connection', 'hs-track', 'hs-meta', 'hs-total', 'metric-ttfb', 'metric-transfer', 'metric-protocol', 'contact']) {
    assert.ok(html.includes(`id="${id}"`), `нет id="${id}"`);
  }
  assert.match(html, /data-copy="\{\{CONTACT\}\}"/);
});

test('публичная главная не превращается в карточку hostname', () => {
  const html = read('pages/index.html');
  assert.doesNotMatch(html, /id="(?:node-headline|node-hostname|node-code|copy-host)"/);
  assert.match(html, /<h1>Infrastructure<br\s*\/>at the edge\.<\/h1>/);
  assert.match(html, /<details class="connection-details">/);
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
    assert.ok(!read(name).includes(site.contact), `${name}: адрес вписан вместо {{CONTACT}}`);
  }
});

test('контакт — только mailto и копирование, формы обращения нет', () => {
  const html = read('pages/index.html');
  assert.doesNotMatch(html, /<dialog/);
  assert.doesNotMatch(html, /<form/);
  assert.doesNotMatch(html, /id="request-/);
  assert.doesNotMatch(html, /data-(?:open|close)-request/);
  assert.match(html, /<a class="contact-mail mono" href="mailto:\{\{CONTACT\}\}">\{\{CONTACT\}\}<\/a>/);
  assert.match(html, /<button class="copy mono"[^>]*data-copy="\{\{CONTACT\}\}"/);
});

test('контакт доступен без JS: ссылка видна, копирование — улучшение', () => {
  const html = read('pages/index.html');
  const link = html.match(/<a class="contact-mail mono"[^>]*>/)?.[0] ?? '';
  assert.ok(!/\shidden/.test(link), 'mailto-ссылка не должна быть скрыта');
  const copy = html.match(/<button class="copy mono"[^>]*>/)?.[0] ?? '';
  assert.match(copy, /\shidden/, 'копирование без JS должно быть скрыто');
});

test('404 не перебивает свой заголовок', () => {
  const html = read('pages/404.html');
  assert.ok(!html.includes('id="node-headline"'), '404 не должна подставлять страну');
  assert.ok(!html.includes('nav:'), '404 не помечает пункт меню активным');
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
  const css = read('styles.css');
  assert.match(css, /--bg:\s*#070b16/);
  assert.match(css, /--accent:\s*#37e0c9/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /--font-mono:\s*"JetBrains Mono"/);
});

test('CSS-блоки сбалансированы, подвал не оказывается внутри медиазапроса', () => {
  const css = read('styles.css');
  assert.equal((css.match(/\{/g) ?? []).length, (css.match(/\}/g) ?? []).length);
  assert.match(css, /@media \(max-width: 30rem\) \{[\s\S]*?\n\}\n\n\/\* ── 404/);
});
