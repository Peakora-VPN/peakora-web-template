import test from 'node:test';
import assert from 'node:assert/strict';

import {
  countryFromHostname,
  flagFromCode,
  nodeLabel,
  pageTitle,
  regionName,
} from '../src/lib.js';

test('разворачивает код страны из первой метки хоста', () => {
  assert.deepEqual(countryFromHostname('pl.peakora.network'), { code: 'PL', name: 'Poland' });
  assert.deepEqual(countryFromHostname('DE.Peakora.Network'), { code: 'DE', name: 'Germany' });
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
  assert.equal(regionName('pl'), 'Poland');
  assert.equal(regionName('x'), null);
  assert.equal(regionName(undefined), null);
});

test('флаг собирается из regional indicator symbols', () => {
  assert.equal(flagFromCode('pl'), '\u{1F1F5}\u{1F1F1}');
  assert.equal(flagFromCode('x'), '');
  assert.equal(flagFromCode(undefined), '');
});

test('подписи деградируют до нейтральных', () => {
  const pl = { code: 'PL', name: 'Poland' };
  assert.equal(nodeLabel(pl), 'Poland · Edge node');
  assert.equal(nodeLabel(null), 'Edge node');
  assert.equal(pageTitle(pl), 'Poland — Peakora Network');
  assert.equal(pageTitle(null), 'Peakora Network — Edge infrastructure');
});
