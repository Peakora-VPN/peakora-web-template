// Чистая логика страницы. Ни одного обращения к DOM: этот модуль импортируют
// и браузер, и тесты Node.

export const DEFAULT_ROLE = 'Edge node';

// ICU резолвит эти коды, но странами они не являются.
const NOT_A_COUNTRY = new Set(['ZZ', 'QO', 'XA', 'XB', 'EU', 'EZ', 'UN']);

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
  const host = hostname.trim().toLowerCase().replace(/\.$/, '');
  const labels = host.split('.');
  if (host.length > 253 || labels.length < 3 || !/^[a-z]/.test(labels.at(-1))) return null;
  if (labels.some((label) => !/^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/.test(label))) return null;

  // shortcut: общие составные зоны; для произвольных hosting-доменов нужен Public Suffix List.
  const suffixLength = labels.at(-1).length === 2 && /^(?:ac|co|com|edu|gov|net|org)$/.test(labels.at(-2)) ? 3 : 2;
  let country = null;
  for (const label of labels.slice(0, -suffixLength)) {
    // Явный код, а не подстрока слова: pl2, pl-2, edge-pl-2, de-fra-01.
    const match = label.match(/^(?:(?:www|edge|node|pop|host|server|api|cdn)\d*-)?([a-z]{2})(?:\d+|(?:-[a-z]{3})?-\d+)?$/);
    if (!match) continue;
    const code = match[1].toUpperCase();
    const name = regionName(code);
    if (!name) continue;
    // Совпадение имён допускает алиасы ICU (UK / GB), но не две разные страны.
    if (country && country.name !== name) return null;
    country ??= { code, name };
  }
  return country;
}

// Подпись в подвале — в приборной манере: код и название.
export function nodeIdentity(country) {
  return country ? `${country.code} · ${country.name}` : DEFAULT_ROLE;
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
