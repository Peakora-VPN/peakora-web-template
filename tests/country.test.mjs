import test from 'node:test';
import assert from 'node:assert/strict';

import {
  countryFromHostname,
  nodeIdentity,
  regionName,
} from '../src/lib.js';

test('разворачивает код страны из первой метки хоста', () => {
  assert.deepEqual(countryFromHostname('pl.peakora.network'), { code: 'PL', name: 'Poland' });
  assert.deepEqual(countryFromHostname('DE.Peakora.Network'), { code: 'DE', name: 'Germany' });
});

test('распознаёт нумерованные узлы без настройки каждой ноды', () => {
  for (const host of ['pl2.peakora.network', 'pl02.example.net', 'pl-2.example.net', ' PL2.Example.Net. ']) {
    assert.deepEqual(countryFromHostname(host), { code: 'PL', name: 'Poland' }, host);
  }
});

test('понимает префиксы, обозначения площадок и вложенные поддомены', () => {
  const hosts = [
    'edge-de-01.example.net', 'node2-de01.example.net', 'de-fra-02.example.net',
    'de.edge.example.net', 'edge.de2.example.net', 'www.node.de-02.example.net',
    'edge-de-01.example.co.uk',
  ];
  for (const host of hosts) {
    assert.deepEqual(countryFromHostname(host), { code: 'DE', name: 'Germany' }, host);
  }
});

test('при конфликтующих кодах не выбирает случайную страну', () => {
  for (const host of ['de.pl.example.net', 'pl2.edge-de-1.example.net', 'de-pl.example.net']) {
    assert.equal(countryFromHostname(host), null, host);
  }
  assert.deepEqual(countryFromHostname('pl.pl2.example.net'), { code: 'PL', name: 'Poland' });
});

test('не принимает зону, случайные слова и некорректный адрес за код узла', () => {
  const hosts = [
    'example.de', 'www.example.pl', 'example.co.uk', 'de.co.uk',
    'sign-in.example.net', 'no-reply.example.net', 'no-one.example.net', 'in-use.example.net', 'plumbing.example.net',
    '127.0.0.1', '[2001:db8::1]', 'pl2.example.net:443',
    'https://pl2.example.net', 'pl2..example.net', 'pl2.example.net/path',
    '-pl.example.net', 'pl-.example.net', 'pl2.example.net..',
    `${'a'.repeat(64)}.pl.example.net`,
    `pl.${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(63)}.net`,
  ];
  for (const host of hosts) assert.equal(countryFromHostname(host), null, host);
});

test('не выдумывает страну там, где её нет', () => {
  const hosts = [
    'philipp.peakora.network', // метка не является кодом страны
    'xq.peakora.network',      // по форме валиден, но ICU его не знает
    'zz.peakora.network',      // псевдорегион «Unknown Region»
    'qo.peakora.network',      // псевдорегион «Outlying Oceania»
    'peakora.network',         // меток меньше трёх — это апекс, а не узел
    'localhost',
    '',
  ];
  for (const host of hosts) {
    assert.equal(countryFromHostname(host), null, host);
  }
});

test('переживает мусор на входе', () => {
  for (const junk of [undefined, null, 42, {}, []]) {
    assert.equal(countryFromHostname(junk), null);
  }
});

test('regionName отсеивает псевдорегионы, но пропускает страны', () => {
  assert.equal(regionName('ZZ'), null);
  assert.equal(regionName('QO'), null);
  for (const code of ['XA', 'XB', 'EU', 'EZ', 'UN']) assert.equal(regionName(code), null, code);
  assert.equal(regionName('pl'), 'Poland');
  assert.equal(regionName('x'), null);
  assert.equal(regionName(undefined), null);
});

test('подписи узла деградируют до нейтральных', () => {
  const pl = { code: 'PL', name: 'Poland' };
  assert.equal(nodeIdentity(pl), 'PL · Poland');
  assert.equal(nodeIdentity(null), 'Edge node');
});

test('без Intl.DisplayNames сохраняет нейтральный вариант', async () => {
  const original = Intl.DisplayNames;
  try {
    Intl.DisplayNames = undefined;
    const lib = await import('../src/lib.js?without-display-names');
    assert.equal(lib.countryFromHostname('pl2.peakora.network'), null);
    assert.equal(lib.regionName('PL'), null);
  } finally {
    Intl.DisplayNames = original;
  }
});
