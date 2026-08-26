// Чистая логика страницы. Ни одного обращения к DOM: этот модуль импортируют
// и браузер, и тесты Node.

export const SITE_NAME = 'Peakora Network';
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

// Заголовок страницы узла: страна, если опознана, иначе нейтральная роль.
export function nodeHeadline(country) {
  return country ? country.name : DEFAULT_ROLE;
}

// Подпись в подвале — в приборной манере: код и название.
export function nodeIdentity(country) {
  return country ? `${country.code} · ${country.name}` : DEFAULT_ROLE;
}

export function pageTitle(country) {
  return country ? `${country.name} — ${SITE_NAME}` : `${SITE_NAME} — Edge infrastructure`;
}

// ─── Измерения соединения ───────────────────────────────────────────────────
// Всё считает сам браузер по Navigation Timing: ни одного запроса наружу.

const PROTOCOL_NAMES = { h2: 'HTTP/2', h3: 'HTTP/3', 'http/1.1': 'HTTP/1.1', 'http/1.0': 'HTTP/1.0' };

export function protocolLabel(nextHopProtocol) {
  if (typeof nextHopProtocol !== 'string' || nextHopProtocol === '') return null;
  return PROTOCOL_NAMES[nextHopProtocol] ?? nextHopProtocol;
}

export function formatMs(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return '—';
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)} s`;
  if (ms < 1) return '<1 ms';
  return `${Math.round(ms)} ms`;
}

// Фазы в том порядке, в котором соединение и устанавливается. Нулевые
// отбрасываются: переиспользованное соединение не проходит DNS и TCP заново,
// и рисовать для них пустые сегменты — врать.
export function handshakePhases(nav) {
  if (!nav || typeof nav !== 'object') return [];
  const secure = nav.secureConnectionStart > 0;
  const phases = [
    { label: 'DNS', ms: nav.domainLookupEnd - nav.domainLookupStart },
    { label: 'TCP', ms: (secure ? nav.secureConnectionStart : nav.connectEnd) - nav.connectStart },
    { label: 'TLS', ms: secure ? nav.connectEnd - nav.secureConnectionStart : 0 },
    { label: 'TTFB', ms: nav.responseStart - nav.requestStart },
    { label: 'TRANSFER', ms: nav.responseEnd - nav.responseStart },
  ];
  return phases.filter((p) => typeof p.ms === 'number' && Number.isFinite(p.ms) && p.ms > 0);
}

// Доли в процентах, но с полом: фаза в доли миллисекунды иначе схлопнется
// в невидимую полоску, а её подпись всё равно нужно прочитать.
export function phaseWidths(phases, minPercent = 8) {
  if (!Array.isArray(phases) || phases.length === 0) return [];
  const total = phases.reduce((sum, p) => sum + p.ms, 0);
  const raw = total > 0 ? phases.map((p) => (p.ms / total) * 100) : phases.map(() => 100 / phases.length);
  const lifted = raw.map((v) => Math.max(v, minPercent));
  const sum = lifted.reduce((s, v) => s + v, 0);
  return lifted.map((v) => (v / sum) * 100);
}
