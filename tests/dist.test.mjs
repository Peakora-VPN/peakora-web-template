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
