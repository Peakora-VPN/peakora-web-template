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
  for (const name of ['index.html', '404.html']) {
    const html = read(name);
    assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/i, `${name}: инлайновый <script>`);
    assert.doesNotMatch(html, /\sstyle="/i, `${name}: атрибут style=`);
  }
});

test('404 повторяет каркас, но не содержит карточку узла', () => {
  const html = read('404.html');
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<meta name="robots" content="noindex, nofollow"/);
  assert.ok(html.includes('<!--LOGO-->'));
  assert.ok(html.includes('id="year"'));
  assert.ok(!html.includes('id="node-label"'), '404 не должна перебивать свой заголовок');
});

test('в исходниках нет запрещённых слов', () => {
  for (const name of ['index.html', '404.html', 'styles.css', 'assets/logo.svg']) {
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
