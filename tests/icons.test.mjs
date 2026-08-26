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
