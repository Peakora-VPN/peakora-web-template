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
const PAGES = ['index.html', 'network/index.html', '404.html'];
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
const page = (name) => readFileSync(join(DIST, name), 'utf8');

before(() => {
  execFileSync(process.execPath, ['build.mjs'], { cwd: ROOT, stdio: 'pipe' });
});

test('собираются все страницы, включая вложенную', () => {
  for (const name of PAGES) {
    assert.doesNotThrow(() => statSync(join(DIST, name)), `нет ${name}`);
  }
});

test('каркас разворачивается: ни одного плейсхолдера не осталось', () => {
  for (const name of PAGES) {
    const html = page(name);
    for (const token of ['{{TITLE}}', '{{DESCRIPTION}}', '{{CONTENT}}', '{{YEAR}}', '<!--LOGO-->']) {
      assert.ok(!html.includes(token), `${name}: остался ${token}`);
    }
    assert.ok(!html.includes('<!--'), `${name}: HTML-комментарии не удалены`);
    assert.match(html, /<path fill="currentColor"/, `${name}: логотип не заинлайнен`);
    assert.match(html, /<title>.+<\/title>/, `${name}: пустой заголовок`);
  }
});

test('у страниц свои заголовки, а активный пункт меню помечен', () => {
  assert.match(page('index.html'), /<title>Peakora Network — Edge infrastructure<\/title>/);
  assert.match(page('network/index.html'), /<title>Network — Peakora Network<\/title>/);
  assert.match(page('404.html'), /<title>Not found — Peakora Network<\/title>/);

  assert.match(page('index.html'), /data-nav="overview" aria-current="page"/);
  assert.match(page('network/index.html'), /data-nav="network" aria-current="page"/);
  assert.doesNotMatch(page('404.html'), /aria-current/, '404 не является пунктом меню');
});

test('контактный адрес подставлен из site.json', () => {
  const site = JSON.parse(readFileSync(join(ROOT, 'src', 'site.json'), 'utf8'));
  for (const name of PAGES) {
    assert.ok(!page(name).includes('{{CONTACT}}'), `${name}: остался плейсхолдер`);
  }
  assert.ok(page('index.html').includes(`mailto:${site.contact}`), 'нет ссылки на почту');
  assert.ok(page('index.html').includes(`data-copy="${site.contact}"`), 'кнопке копирования нечего копировать');
  assert.ok(page('network/index.html').includes(site.contact), 'на /network/ нет адреса');
});

test('сборка подставляет хэшированные имена ассетов', () => {
  for (const name of PAGES) {
    const html = page(name);
    assert.match(html, /href="\/assets\/styles\.[0-9a-f]{8}\.css"/, name);
    assert.match(html, /src="\/assets\/app\.[0-9a-f]{8}\.js"/, name);
  }
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
