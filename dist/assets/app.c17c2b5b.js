import {
  countryFromHostname,
  formatMs,
  handshakePhases,
  nodeHeadline,
  nodeIdentity,
  pageTitle,
  phaseWidths,
  protocolLabel,
} from './lib.76c4977c.js';

// Разметка уже содержит нейтральные значения — здесь они только уточняются.
// Всё под guard'ами: один и тот же модуль грузится на всех страницах, а
// карточки узла и шкалы есть не на каждой.

export function applyNode(doc, hostname, now) {
  const country = countryFromHostname(hostname);

  const headline = doc.getElementById('node-headline');
  if (headline) {
    headline.textContent = nodeHeadline(country);
    doc.title = pageTitle(country);
  }

  const footNode = doc.getElementById('foot-node');
  if (footNode) footNode.textContent = nodeIdentity(country);

  const year = doc.getElementById('year');
  if (year) year.textContent = String(now.getFullYear());

  return country;
}

export function applyConnection(doc, nav, country) {
  const track = doc.getElementById('hs-track');
  if (!track) return null;

  const phases = handshakePhases(nav);
  if (phases.length === 0) return null;

  const widths = phaseWidths(phases);
  const last = Math.max(phases.length - 1, 1);

  track.textContent = '';
  phases.forEach((phase, i) => {
    const seg = doc.createElement('li');
    seg.className = 'seg';
    seg.style.setProperty('--w', `${widths[i].toFixed(2)}%`);
    seg.style.setProperty('--i', String(i));
    // Одна тональность на всю шкалу: непрозрачность растёт к концу и читается
    // как продвижение по фазам. Цвет остаётся «живым» бирюзовым во всех.
    seg.style.setProperty('--a', (0.4 + (0.6 * i) / last).toFixed(2));

    const bar = doc.createElement('span');
    bar.className = 'seg-bar';

    const label = doc.createElement('span');
    label.className = 'seg-label';
    label.textContent = phase.label;

    const value = doc.createElement('span');
    value.className = 'seg-ms';
    value.textContent = formatMs(phase.ms);

    seg.append(bar, label, value);
    track.append(seg);
  });

  const meta = doc.getElementById('hs-meta');
  if (meta) {
    const total = phases.reduce((sum, p) => sum + p.ms, 0);
    const protocol = protocolLabel(nav.nextHopProtocol);
    const parts = [];
    if (country) parts.push(country.code);
    if (protocol) parts.push(protocol);
    parts.push(formatMs(total));
    meta.textContent = parts.join(' · ');
  }

  // Класс включает анимацию: до него сегменты сжаты в ноль.
  track.classList.add('is-live');
  return phases;
}

export function wireCopyButtons(doc, clipboard, schedule = setTimeout) {
  if (!clipboard || typeof clipboard.writeText !== 'function') return 0;
  const buttons = doc.querySelectorAll('[data-copy]');
  for (const button of buttons) {
    button.addEventListener('click', () => {
      const original = button.textContent;
      clipboard.writeText(button.getAttribute('data-copy')).then(
        () => {
          button.textContent = 'Copied';
          button.setAttribute('data-copied', '');
          schedule(() => {
            button.textContent = original;
            button.removeAttribute('data-copied');
          }, 1600);
        },
        () => {},
      );
    });
  }
  return buttons.length;
}

if (typeof document !== 'undefined' && typeof location !== 'undefined') {
  const country = applyNode(document, location.hostname, new Date());

  const nav =
    typeof performance !== 'undefined' && typeof performance.getEntriesByType === 'function'
      ? performance.getEntriesByType('navigation')[0]
      : null;
  applyConnection(document, nav, country);

  wireCopyButtons(document, typeof navigator !== 'undefined' ? navigator.clipboard : null);
}
