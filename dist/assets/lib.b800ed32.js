// Чистая логика страницы. Ни одного обращения к DOM: этот модуль импортируют
// и браузер, и тесты Node.

export const SITE_NAME = 'Peakora Network';
export const CONTACT_EMAIL = 'abuse@peakora.network';
export const DEFAULT_ROLE = 'Edge node';

// ICU резолвит эти коды, но странами они не являются.
const NOT_A_COUNTRY = new Set(['ZZ', 'QO', 'XA', 'XB']);

// fallback: 'none' заставляет .of() вернуть undefined для неизвестного кода —
// это и есть проверка валидности, поэтому таблицу ISO везти не нужно.
let displayNames;
try {
  displayNames = new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' });
} catch {
  displayNames = null;
}

export function regionName(code) {
  if (typeof code !== 'string' || !/^[a-z]{2}$/i.test(code)) return null;
  const cc = code.toUpperCase();
  if (NOT_A_COUNTRY.has(cc) || !displayNames) return null;
  try {
    return displayNames.of(cc) || null;
  } catch {
    return null;
  }
}

export function countryFromHostname(hostname) {
  if (typeof hostname !== 'string') return null;
  const labels = hostname.trim().toLowerCase().split('.');
  // Узлу нужно минимум <метка>.<домен>.<зона>; апекс сам по себе узлом не является.
  if (labels.length < 3) return null;
  const name = regionName(labels[0]);
  return name ? { code: labels[0].toUpperCase(), name } : null;
}

export function flagFromCode(code) {
  if (typeof code !== 'string' || !/^[a-z]{2}$/i.test(code)) return '';
  return String.fromCodePoint(
    ...[...code.toUpperCase()].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65),
  );
}

export function nodeLabel(country) {
  return country ? `${country.name} · ${DEFAULT_ROLE}` : DEFAULT_ROLE;
}

export function pageTitle(country) {
  return country ? `${country.name} — ${SITE_NAME}` : `${SITE_NAME} — Edge infrastructure`;
}
