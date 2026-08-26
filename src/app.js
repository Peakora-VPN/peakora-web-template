import { countryFromHostname, flagFromCode, nodeLabel, pageTitle } from './lib.js';

// Разметка уже содержит нейтральные значения — здесь они только уточняются.
// Всё под guard'ами: этот же модуль грузится на странице 404, где карточки узла нет.
export function applyNode(doc, hostname, now) {
  const country = countryFromHostname(hostname);

  const label = doc.getElementById('node-label');
  if (label) {
    label.textContent = nodeLabel(country);
    doc.title = pageTitle(country);
  }

  const flag = doc.getElementById('node-flag');
  if (flag) flag.textContent = country ? flagFromCode(country.code) : '';

  const year = doc.getElementById('year');
  if (year) year.textContent = String(now.getFullYear());

  return country;
}

if (typeof document !== 'undefined' && typeof location !== 'undefined') {
  applyNode(document, location.hostname, new Date());
}
