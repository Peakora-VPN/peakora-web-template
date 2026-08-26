import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));

// Inter отдаётся вариативным шрифтом: один файл на веса 400 и 500.
const FILES = ['inter-latin.woff2', 'space-grotesk-latin.woff2', 'jetbrains-mono-latin.woff2'];
const LICENSES = ['OFL.txt', 'OFL-SpaceGrotesk.txt', 'OFL-JetBrainsMono.txt'];

const css = () => readFileSync(`${SRC}styles.css`, 'utf8');

function parseRanges(text) {
  const ranges = [];
  for (const decl of text.matchAll(/unicode-range:\s*([^;]+);/g)) {
    for (const part of decl[1].split(',')) {
      const m = part.trim().match(/^U\+([0-9A-Fa-f]+)(?:-([0-9A-Fa-f]+))?$/);
      if (!m) continue;
      const lo = parseInt(m[1], 16);
      ranges.push([lo, m[2] ? parseInt(m[2], 16) : lo]);
    }
  }
  return ranges;
}

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

test('лицензии SIL OFL лежат рядом со шрифтами', () => {
  for (const name of LICENSES) {
    const text = readFileSync(`${SRC}assets/fonts/${name}`, 'utf8');
    assert.match(text, /SIL OPEN FONT LICENSE/i, `${name}: не похоже на OFL`);
  }
});

test('styles.css подключает только локальные шрифты', () => {
  const text = css();
  for (const name of FILES) {
    assert.ok(text.includes(`/assets/fonts/${name}`), `в CSS нет ссылки на ${name}`);
  }
  assert.doesNotMatch(text, /https?:\/\//i, 'CSS тянет что-то извне');
  assert.match(text, /font-display:\s*swap/);
});

// Именно этот тест оправдывает отказ от подмножества latin-ext: если ICU когда-нибудь
// начнёт отдавать название региона с символом вне диапазона, глиф молча уедет на
// запасной шрифт посреди строки — тест поймает это раньше, чем глаз.
test('unicode-range покрывает все английские названия регионов и строки страниц', () => {
  const ranges = parseRanges(css());
  assert.ok(ranges.length > 0, 'в CSS нет ни одного unicode-range');
  const covered = (cp) => ranges.some(([lo, hi]) => cp >= lo && cp <= hi);

  const dn = new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' });
  const missing = new Set();

  for (let a = 65; a <= 90; a++) {
    for (let b = 65; b <= 90; b++) {
      let name;
      try {
        name = dn.of(String.fromCharCode(a, b));
      } catch {
        continue;
      }
      if (!name) continue;
      for (const ch of name) if (!covered(ch.codePointAt(0))) missing.add(ch);
    }
  }

  const pages = ['layout.html', 'pages/index.html', 'pages/network.html', 'pages/404.html'];
  const text = pages
    .map((p) => readFileSync(SRC + p, 'utf8'))
    .join('')
    .replace(/<[^>]*>/g, ' ');
  for (const ch of text) if (!covered(ch.codePointAt(0))) missing.add(ch);

  assert.equal(missing.size, 0, `вне unicode-range: ${[...missing].join(' ')}`);
});
