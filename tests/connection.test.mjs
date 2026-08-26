import test from 'node:test';
import assert from 'node:assert/strict';

import { formatMs, handshakePhases, phaseWidths, protocolLabel } from '../src/lib.js';

// Слепок PerformanceNavigationTiming: HTTPS, свежее соединение.
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

test('формат миллисекунд читаем во всех порядках величин', () => {
  assert.equal(formatMs(0.4), '<1 ms');
  assert.equal(formatMs(1), '1 ms');
  assert.equal(formatMs(47.6), '48 ms');
  assert.equal(formatMs(999), '999 ms');
  assert.equal(formatMs(1000), '1.00 s');
  assert.equal(formatMs(2345), '2.35 s');
  assert.equal(formatMs(-1), '—');
  assert.equal(formatMs(NaN), '—');
  assert.equal(formatMs(undefined), '—');
});

test('протокол называется так, как его знает человек', () => {
  assert.equal(protocolLabel('h2'), 'HTTP/2');
  assert.equal(protocolLabel('h3'), 'HTTP/3');
  assert.equal(protocolLabel('http/1.1'), 'HTTP/1.1');
  assert.equal(protocolLabel('quic'), 'quic'); // неизвестное — как есть
  assert.equal(protocolLabel(''), null);
  assert.equal(protocolLabel(undefined), null);
});

test('фазы рукопожатия идут в порядке установления соединения', () => {
  const phases = handshakePhases(FRESH);
  assert.deepEqual(
    phases.map((p) => p.label),
    ['DNS', 'TCP', 'TLS', 'TTFB', 'TRANSFER'],
  );
  assert.deepEqual(
    phases.map((p) => p.ms),
    [4, 17, 31, 48, 8],
  );
});

test('без TLS фаза не выдумывается', () => {
  const plain = { ...FRESH, secureConnectionStart: 0 };
  const labels = handshakePhases(plain).map((p) => p.label);
  assert.ok(!labels.includes('TLS'), 'по HTTP фазы TLS быть не должно');
  // TCP тогда считается до конца соединения целиком.
  assert.equal(handshakePhases(plain).find((p) => p.label === 'TCP').ms, 48);
});

test('нулевые фазы отбрасываются, а не рисуются пустыми', () => {
  const reused = { ...FRESH, domainLookupEnd: 10, connectStart: 62, secureConnectionStart: 0, connectEnd: 62 };
  const labels = handshakePhases(reused).map((p) => p.label);
  assert.deepEqual(labels, ['TTFB', 'TRANSFER'], 'переиспользованное соединение — только чтение');
});

test('на мусоре и пустоте не падает', () => {
  assert.deepEqual(handshakePhases(null), []);
  assert.deepEqual(handshakePhases(undefined), []);
  assert.deepEqual(handshakePhases({}), []);
});

test('ширины сегментов дают ровно сто процентов', () => {
  const widths = phaseWidths(handshakePhases(FRESH));
  const sum = widths.reduce((s, w) => s + w, 0);
  assert.ok(Math.abs(sum - 100) < 1e-9, `сумма ${sum}`);
});

test('крошечная фаза остаётся видимой', () => {
  const phases = [
    { label: 'DNS', ms: 0.2 },
    { label: 'TTFB', ms: 400 },
  ];
  const [dns] = phaseWidths(phases, 8);
  assert.ok(dns >= 6, `узкая фаза схлопнулась до ${dns}%`);
});

test('ширины пустого списка — пустой список', () => {
  assert.deepEqual(phaseWidths([]), []);
});
