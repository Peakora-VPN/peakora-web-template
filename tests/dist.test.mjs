import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');

const TEXT_EXT = new Set(['.html', '.css', '.js', '.svg', '.txt']);
const NAMESPACES = ['http://www.w3.org/2000/svg', 'http://www.w3.org/1999/xlink'];
const PAGES = [
  'index.html',
  'network/index.html',
  '404.html',
  'articles/name-resolution/index.html',
  'articles/connection-reuse/index.html',
  'articles/reading-timings/index.html',
];
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
  assert.match(page('articles/name-resolution/index.html'), /<title>Name resolution — Peakora Network<\/title>/);
  assert.match(page('articles/connection-reuse/index.html'), /<title>Connection reuse — Peakora Network<\/title>/);
  assert.match(page('articles/reading-timings/index.html'), /<title>Reading timings — Peakora Network<\/title>/);

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
  for (const name of PAGES.filter((p) => p.startsWith('articles/'))) {
    assert.ok(page(name).includes(`mailto:${site.contact}`), `${name}: нет рабочей ссылки на почту`);
  }
});

test('все корневые внутренние ссылки dist ведут на существующие файлы или каталоги', () => {
  const hrefs = new Set();
  for (const file of walk(DIST).filter((f) => extname(f) === '.html')) {
    for (const match of readFileSync(file, 'utf8').matchAll(/href="([^"]+)"/g)) hrefs.add(match[1]);
  }
  assert.ok(hrefs.size > 0, 'в dist вообще нет ссылок');

  let checked = 0;
  for (const href of hrefs) {
    if (href.startsWith('mailto:') || href.startsWith('#')) continue; // почта и якоря внутри страницы
    if (/^[a-z][a-z0-9+.-]*:/i.test(href)) continue; // внешние схемы, включая переходы на чужие якоря
    assert.ok(href.startsWith('/'), `${href}: в dist ожидаются только корневые ссылки`);
    const path = href.split('#')[0].split('?')[0];
    if (!path) continue; // "/#contact" — якорь на корне
    checked++;
    assert.ok(existsSync(join(DIST, path)), `${href} ведёт в никуда: нет ${path}`);
  }
  assert.ok(checked > 0, 'проверка внутренних ссылок ничего не проверила');
});

// Каждая статья ссылается на две другие и возвращает в сетевой гид, а гид
// ссылается на все три — иначе раздел «Further reading» читается в никуда.
const ARTICLE_LINKS = {
  'articles/name-resolution/index.html': ['/articles/connection-reuse/', '/articles/reading-timings/'],
  'articles/connection-reuse/index.html': ['/articles/name-resolution/', '/articles/reading-timings/'],
  'articles/reading-timings/index.html': ['/articles/name-resolution/', '/articles/connection-reuse/'],
};

test('статьи взаимосвязаны и сцеплены с сетевым гидом', () => {
  for (const [name, links] of Object.entries(ARTICLE_LINKS)) {
    const html = page(name);
    for (const link of links) {
      assert.ok(html.includes(`href="${link}"`), `${name} не ссылается на ${link}`);
    }
    assert.ok(html.includes('href="/network/"'), `${name} не возвращает в сетевой гид`);
  }
  const guide = page('network/index.html');
  for (const link of new Set(Object.values(ARTICLE_LINKS).flat())) {
    assert.ok(guide.includes(`href="${link}"`), `гид не ссылается на ${link}`);
  }
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
