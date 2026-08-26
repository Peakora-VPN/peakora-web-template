import test from 'node:test';
import assert from 'node:assert/strict';

import { applyNode } from '../src/app.js';

function fakeDoc(ids) {
  const els = new Map(ids.map((id) => [id, { textContent: '' }]));
  return { title: '', getElementById: (id) => els.get(id) ?? null, els };
}

const AT = new Date('2031-04-15T12:00:00Z');

test('подставляет страну, флаг, год и заголовок', () => {
  const doc = fakeDoc(['node-label', 'node-flag', 'year']);
  applyNode(doc, 'pl.peakora.network', AT);
  assert.equal(doc.els.get('node-label').textContent, 'Poland · Edge node');
  assert.equal(doc.els.get('node-flag').textContent, '\u{1F1F5}\u{1F1F1}');
  assert.equal(doc.els.get('year').textContent, '2031');
  assert.equal(doc.title, 'Poland — Peakora Network');
});

test('на неопознанном хосте остаётся нейтральной', () => {
  const doc = fakeDoc(['node-label', 'node-flag', 'year']);
  applyNode(doc, 'philipp.peakora.network', AT);
  assert.equal(doc.els.get('node-label').textContent, 'Edge node');
  assert.equal(doc.els.get('node-flag').textContent, '');
  assert.equal(doc.title, 'Peakora Network — Edge infrastructure');
});

test('не трогает заголовок страницы без карточки узла', () => {
  const doc = fakeDoc(['year']);
  assert.doesNotThrow(() => applyNode(doc, 'pl.peakora.network', AT));
  assert.equal(doc.els.get('year').textContent, '2031');
  assert.equal(doc.title, '', 'страница 404 должна сохранить свой заголовок');
});
