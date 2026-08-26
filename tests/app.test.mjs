import test from 'node:test';
import assert from 'node:assert/strict';

import { applyConnection, applyNode, wireCopyButtons } from '../src/app.js';

// Минимальный поддельный DOM: jsdom тянуть некуда, зависимостей в проекте нет.
function el(tag = 'div') {
  const node = {
    tagName: tag,
    className: '',
    textContent: '',
    children: [],
    attrs: {},
    classes: new Set(),
    listeners: {},
    style: { props: {}, setProperty(key, value) { this.props[key] = value; } },
    append(...kids) { node.children.push(...kids); },
    setAttribute(key, value) { node.attrs[key] = value; },
    removeAttribute(key) { delete node.attrs[key]; },
    getAttribute(key) {
      return Object.prototype.hasOwnProperty.call(node.attrs, key) ? node.attrs[key] : null;
    },
    addEventListener(type, fn) { (node.listeners[type] ||= []).push(fn); },
  };
  node.classList = { add: (name) => node.classes.add(name) };
  return node;
}

function fakeDoc(ids = [], copyTargets = []) {
  const byId = new Map(ids.map((id) => [id, el()]));
  return {
    title: '',
    byId,
    getElementById: (id) => byId.get(id) ?? null,
    createElement: (tag) => el(tag),
    querySelectorAll: () => copyTargets,
  };
}

const AT = new Date('2031-04-15T12:00:00Z');

const FRESH = {
  nextHopProtocol: 'h2',
  domainLookupStart: 10,
  domainLookupEnd: 14,
  connectStart: 14,
  secureConnectionStart: 31,
  connectEnd: 62,
  requestStart: 62,
  responseStart: 110,
  responseEnd: 118,
};

test('подставляет страну, подпись узла, год и заголовок', () => {
  const doc = fakeDoc(['node-headline', 'foot-node', 'year']);
  applyNode(doc, 'pl.peakora.network', AT);
  assert.equal(doc.byId.get('node-headline').textContent, 'Poland');
  assert.equal(doc.byId.get('foot-node').textContent, 'PL · Poland');
  assert.equal(doc.byId.get('year').textContent, '2031');
  assert.equal(doc.title, 'Poland — Peakora Network');
});

test('на неопознанном хосте остаётся нейтральной', () => {
  const doc = fakeDoc(['node-headline', 'foot-node', 'year']);
  applyNode(doc, 'philipp.peakora.network', AT);
  assert.equal(doc.byId.get('node-headline').textContent, 'Edge node');
  assert.equal(doc.byId.get('foot-node').textContent, 'Edge node');
  assert.equal(doc.title, 'Peakora Network — Edge infrastructure');
});

test('не трогает заголовок страницы без карточки узла', () => {
  const doc = fakeDoc(['year', 'foot-node']);
  assert.doesNotThrow(() => applyNode(doc, 'pl.peakora.network', AT));
  assert.equal(doc.byId.get('year').textContent, '2031');
  assert.equal(doc.title, '', 'страница 404 должна сохранить свой заголовок');
});

test('шкала рукопожатия собирается по фазам и включает анимацию', () => {
  const doc = fakeDoc(['hs-track', 'hs-meta']);
  const track = doc.byId.get('hs-track');
  const phases = applyConnection(doc, FRESH, { code: 'PL', name: 'Poland' });

  assert.equal(phases.length, 5);
  assert.equal(track.children.length, 5);
  assert.ok(track.classes.has('is-live'), 'без is-live сегменты останутся сжатыми в ноль');

  const widths = track.children.map((seg) => parseFloat(seg.style.props['--w']));
  assert.ok(Math.abs(widths.reduce((s, w) => s + w, 0) - 100) < 0.05, `сумма ${widths}`);
  assert.equal(track.children[0].style.props['--i'], '0');

  const labels = track.children.map((seg) => seg.children[1].textContent);
  assert.deepEqual(labels, ['DNS', 'TCP', 'TLS', 'TTFB', 'TRANSFER']);
  assert.equal(track.children[2].children[2].textContent, '31 ms');

  // 4 + 17 + 31 + 48 + 8 = 108
  assert.equal(doc.byId.get('hs-meta').textContent, 'PL · HTTP/2 · 108 ms');
});

test('без страны подпись шкалы обходится протоколом и итогом', () => {
  const doc = fakeDoc(['hs-track', 'hs-meta']);
  applyConnection(doc, FRESH, null);
  assert.equal(doc.byId.get('hs-meta').textContent, 'HTTP/2 · 108 ms');
});

test('без измерений заметка в шкале остаётся нетронутой', () => {
  const doc = fakeDoc(['hs-track', 'hs-meta']);
  const track = doc.byId.get('hs-track');
  track.textContent = 'Timing appears here once the page finishes loading.';

  assert.equal(applyConnection(doc, null, null), null);
  assert.equal(track.textContent, 'Timing appears here once the page finishes loading.');
  assert.ok(!track.classes.has('is-live'));
});

test('на странице без шкалы ничего не делает', () => {
  const doc = fakeDoc(['year']);
  assert.equal(applyConnection(doc, FRESH, null), null);
});

test('кнопка копирования кладёт адрес в буфер и возвращается в исходный вид', async () => {
  const button = el('button');
  button.textContent = 'Copy';
  button.setAttribute('data-copy', 'abuse@peakora.network');

  const doc = fakeDoc([], [button]);
  const written = [];
  const timers = [];
  const clipboard = { writeText: (text) => { written.push(text); return Promise.resolve(); } };

  assert.equal(wireCopyButtons(doc, clipboard, (fn) => timers.push(fn)), 1);

  button.listeners.click[0]();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(written, ['abuse@peakora.network']);
  assert.equal(button.textContent, 'Copied');
  assert.equal(button.getAttribute('data-copied'), '');

  timers[0]();
  assert.equal(button.textContent, 'Copy');
  assert.equal(button.getAttribute('data-copied'), null);
});

test('без буфера обмена кнопки просто не подключаются', () => {
  const button = el('button');
  const doc = fakeDoc([], [button]);
  assert.equal(wireCopyButtons(doc, null), 0);
  assert.equal(wireCopyButtons(doc, {}), 0);
  assert.deepEqual(button.listeners, {});
});
