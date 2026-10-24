import test from 'node:test';
import assert from 'node:assert/strict';

import * as app from '../src/app.js';
const { applyConnection, applyNode, wireCopyButtons, wireTabs, wireRequestComposer } = app;

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
    focus() { node.focused = true; },
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

test('подставляет регион и год, сохраняя название публичного сайта', () => {
  const doc = fakeDoc(['node-location', 'foot-node', 'year']);
  doc.title = 'Peakora Network — Edge infrastructure';
  applyNode(doc, 'pl2.peakora.network', AT);
  assert.equal(doc.byId.get('node-location').textContent, 'Poland');
  assert.equal(doc.byId.get('foot-node').textContent, 'PL · Poland');
  assert.equal(doc.byId.get('year').textContent, '2031');
  assert.equal(doc.title, 'Peakora Network — Edge infrastructure');
});

test('на неопознанном хосте остаётся нейтральной', () => {
  const doc = fakeDoc(['node-location', 'foot-node', 'year']);
  applyNode(doc, 'philipp.peakora.network', AT);
  assert.equal(doc.byId.get('node-location').textContent, 'Edge node');
  assert.equal(doc.byId.get('foot-node').textContent, 'Edge node');
  assert.equal(doc.title, '');
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

test('сводка соединения показывает только измеренные длительности и протокол', () => {
  const doc = fakeDoc(['hs-track', 'hs-total', 'metric-ttfb', 'metric-transfer', 'metric-protocol', 'connection']);
  applyConnection(doc, FRESH, null);
  assert.equal(doc.byId.get('hs-total').textContent, '108 ms');
  assert.equal(doc.byId.get('metric-ttfb').textContent, '48 ms');
  assert.equal(doc.byId.get('metric-transfer').textContent, '8 ms');
  assert.equal(doc.byId.get('metric-protocol').textContent, 'HTTP/2');
  assert.equal(doc.byId.get('connection').getAttribute('data-measured'), '');
});

test('сводка не додумывает скрытый протокол и недоступные фазы', () => {
  const doc = fakeDoc(['hs-track', 'metric-ttfb', 'metric-transfer', 'metric-protocol']);
  applyConnection(doc, { responseStart: 12, responseEnd: 15, nextHopProtocol: '' }, null);
  assert.equal(doc.byId.get('metric-ttfb').textContent, '—');
  assert.equal(doc.byId.get('metric-transfer').textContent, '3 ms');
  assert.equal(doc.byId.get('metric-protocol').textContent, 'Not exposed');
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
  button.setAttribute('hidden', '');

  const doc = fakeDoc([], [button]);
  const written = [];
  const timers = [];
  const clipboard = { writeText: (text) => { written.push(text); return Promise.resolve(); } };

  assert.equal(wireCopyButtons(doc, clipboard, (fn) => timers.push(fn)), 1);
  assert.equal(button.getAttribute('hidden'), null);

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

test('повторное копирование продлевает подтверждение и возвращает исходную подпись', async () => {
  const button = el('button');
  button.textContent = 'Copy';
  button.setAttribute('data-copy', 'fixture@example.invalid');
  const timers = new Map();
  let nextId = 0;
  wireCopyButtons(fakeDoc([], [button]), { writeText: async () => {} },
    callback => { const id = nextId++; timers.set(id, callback); return id; },
    id => timers.delete(id));
  button.listeners.click[0]();
  await Promise.resolve();
  button.listeners.click[0]();
  await Promise.resolve();
  assert.equal(timers.size, 1, 'первый таймер должен быть отменён');
  [...timers.values()][0]();
  assert.equal(button.textContent, 'Copy');
  assert.equal(button.getAttribute('data-copied'), null);
});

test('отказ буфера обмена не показывает ложное подтверждение', async () => {
  const button = el('button');
  button.textContent = 'Copy';
  const timers = [];
  wireCopyButtons(fakeDoc([], [button]), { writeText: async () => { throw new Error('denied'); } },
    callback => timers.push(callback));
  button.listeners.click[0]();
  await Promise.resolve();
  assert.equal(button.textContent, 'Copy');
  assert.equal(button.getAttribute('data-copied'), null);
  assert.equal(timers.length, 0);
});

function tabFixture(prefix) {
  const tabs = Array.from({ length: 3 }, (_, i) => {
    const tab = el('button');
    tab.id = `${prefix}-tab-${i}`;
    tab.setAttribute('aria-controls', `${prefix}-panel-${i}`);
    return tab;
  });
  const panels = tabs.map(() => el('section'));
  const list = el();
  list.hidden = true;
  list.querySelectorAll = () => tabs;
  const group = el();
  group.querySelector = () => list;
  return { tabs, panels, list, group };
}

function tabDoc(...groups) {
  const byId = new Map(groups.flatMap(({ tabs, panels }) =>
    tabs.map((tab, i) => [tab.getAttribute('aria-controls'), panels[i]])));
  return { querySelectorAll: () => groups.map((item) => item.group), getElementById: (id) => byId.get(id) };
}

test('вкладки связывают подписи с панелями и показывают выбранный раздел', () => {
  const fixture = tabFixture('areas');
  const { tabs, panels, list } = fixture;
  assert.equal(wireTabs(tabDoc(fixture)), 1);
  assert.equal(list.hidden, false);
  assert.equal(list.getAttribute('role'), 'tablist');
  assert.deepEqual(panels.map((panel) => panel.hidden), [false, true, true]);
  assert.equal(panels[0].getAttribute('aria-labelledby'), tabs[0].id);
  tabs[1].listeners.click[0]();
  assert.deepEqual(panels.map((panel) => panel.hidden), [true, false, true]);
  assert.deepEqual(tabs.map((tab) => tab.getAttribute('aria-selected')), ['false', 'true', 'false']);
  assert.deepEqual(tabs.map((tab) => tab.getAttribute('tabindex')), ['-1', '0', '-1']);
});

test('вкладки доступны стрелками, Home и End и не перехватывают обычный Tab', () => {
  const fixture = tabFixture('keys');
  wireTabs(tabDoc(fixture));
  for (const [from, key, to] of [[0, 'ArrowLeft', 2], [2, 'ArrowRight', 0], [0, 'End', 2], [2, 'Home', 0], [0, 'ArrowDown', 1], [1, 'ArrowUp', 0]]) {
    let prevented = false;
    fixture.tabs[from].listeners.keydown[0]({ key, preventDefault() { prevented = true; } });
    assert.equal(fixture.panels[to].hidden, false, key);
    assert.equal(fixture.tabs[to].focused, true, key);
    assert.equal(prevented, true, key);
  }
  fixture.tabs[0].listeners.keydown[0]({ key: 'Tab', preventDefault() { assert.fail('Tab должен работать как обычно'); } });
});

test('две группы вкладок переключаются независимо, страницы без них работают', () => {
  const first = tabFixture('first');
  const second = tabFixture('second');
  assert.equal(wireTabs(tabDoc(first, second)), 2);
  first.tabs[2].listeners.click[0]();
  assert.deepEqual(first.panels.map((panel) => panel.hidden), [true, true, false]);
  assert.deepEqual(second.panels.map((panel) => panel.hidden), [false, true, true]);
  assert.equal(wireTabs(tabDoc()), 0);
});

test('неполная разметка вкладок не прерывает подключение остальных групп', () => {
  const broken = tabFixture('broken');
  broken.panels[1] = null;
  const valid = tabFixture('valid');
  assert.equal(wireTabs(tabDoc(broken, valid)), 1);
  assert.equal(broken.list.hidden, true);
  assert.equal(valid.list.hidden, false);
});

test('страницы без диалога и браузеры без showModal сохраняют контакт по почте', () => {
  assert.equal(wireRequestComposer(fakeDoc()), false);
  assert.equal(wireRequestComposer(fakeDoc(['request-dialog'])), false);
});
