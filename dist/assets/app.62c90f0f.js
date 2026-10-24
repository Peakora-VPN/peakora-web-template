import {
  countryFromHostname,
  DEFAULT_ROLE,
  formatMs,
  handshakePhases,
  nodeIdentity,
  phaseWidths,
  protocolLabel,
} from './lib.91f0501e.js';

// Разметка уже содержит нейтральные значения — здесь они только уточняются.
// Всё под guard'ами: один и тот же модуль грузится на всех страницах, а
// интерактивные блоки и шкала есть не на каждой.

export function applyNode(doc, hostname, now) {
  const country = countryFromHostname(hostname);

  const location = doc.getElementById('node-location');
  if (location) location.textContent = country?.name ?? DEFAULT_ROLE;

  const footNode = doc.getElementById('foot-node');
  if (footNode) footNode.textContent = nodeIdentity(country);

  const year = doc.getElementById('year');
  if (year) year.textContent = String(now.getFullYear());

  return country;
}

export function wireTabs(doc) {
  let count = 0;
  for (const group of doc.querySelectorAll('[data-tabs]')) {
    const list = group.querySelector('[data-tab-list]');
    const tabs = [...(list?.querySelectorAll('[data-tab]') ?? [])];
    const panels = tabs.map((tab) => doc.getElementById(tab.getAttribute('aria-controls')));
    if (!tabs.length || panels.some((panel) => !panel)) continue;

    const select = (index) => tabs.forEach((tab, i) => {
      tab.setAttribute('aria-selected', String(i === index));
      tab.setAttribute('tabindex', i === index ? '0' : '-1');
      panels[i].hidden = i !== index;
    });
    tabs.forEach((tab, i) => {
      tab.setAttribute('role', 'tab');
      panels[i].setAttribute('role', 'tabpanel');
      panels[i].setAttribute('aria-labelledby', tab.id);
      panels[i].setAttribute('tabindex', '0');
      tab.addEventListener('click', () => select(i));
      tab.addEventListener('keydown', (event) => {
        let next;
        switch (event.key) {
          case 'ArrowLeft': case 'ArrowUp': next = (i + tabs.length - 1) % tabs.length; break;
          case 'ArrowRight': case 'ArrowDown': next = (i + 1) % tabs.length; break;
          case 'Home': next = 0; break;
          case 'End': next = tabs.length - 1; break;
          default: return;
        }
        event.preventDefault();
        select(next);
        tabs[next].focus();
      });
    });
    select(0);
    list.setAttribute('role', 'tablist');
    list.hidden = false;
    group.setAttribute('data-enhanced', '');
    count++;
  }
  return count;
}

export function applyConnection(doc, nav, country) {
  const track = doc.getElementById('hs-track');
  if (!track) return null;

  const phases = handshakePhases(nav);
  if (phases.length === 0) return null;

  const widths = phaseWidths(phases);
  const last = Math.max(phases.length - 1, 1);
  const total = phases.reduce((sum, p) => sum + p.ms, 0);
  const protocol = protocolLabel(nav.nextHopProtocol);

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
    const parts = [];
    if (country) parts.push(country.code);
    if (protocol) parts.push(protocol);
    parts.push(formatMs(total));
    meta.textContent = parts.join(' · ');
  }

  const readings = {
    'hs-total': formatMs(total),
    'metric-ttfb': formatMs(nav.responseStart - nav.requestStart),
    'metric-transfer': formatMs(nav.responseEnd - nav.responseStart),
    'metric-protocol': protocol ?? 'Not exposed',
  };
  for (const [id, value] of Object.entries(readings)) {
    const element = doc.getElementById(id);
    if (element) element.textContent = value;
  }
  const connection = doc.getElementById('connection');
  if (connection) connection.setAttribute('data-measured', '');

  // Класс включает анимацию: до него сегменты сжаты в ноль.
  track.classList.add('is-live');
  return phases;
}

export function wireRequestComposer(doc) {
  const dialog = doc.getElementById('request-dialog');
  if (!dialog || typeof dialog.showModal !== 'function') return false;
  const form = doc.getElementById('request-form');
  const complete = doc.getElementById('request-complete');
  const title = doc.getElementById('request-title');
  const intro = doc.getElementById('request-intro');
  const initialIntro = intro.textContent;
  const summary = doc.getElementById('request-errors');
  const counter = doc.getElementById('request-count');
  const fields = [...form.querySelectorAll('input, select, textarea')];
  const message = form.elements.namedItem('message');
  const updateCount = () => { counter.textContent = `${message.value.length} / ${message.maxLength}`; };

  const validate = (field) => {
    field.setCustomValidity('');
    const value = field.value.trim();
    if (!value) field.setCustomValidity(field.tagName === 'SELECT' ? 'Choose a topic.' : 'This field is required.');
    else if (field.minLength > 0 && value.length < field.minLength) field.setCustomValidity(`Use at least ${field.minLength} characters.`);
    else if (field.maxLength > 0 && field.value.length > field.maxLength) field.setCustomValidity(`Use no more than ${field.maxLength} characters.`);
    else if (field.validity.typeMismatch) field.setCustomValidity('Enter a valid email address.');
    const error = doc.getElementById(`${field.id}-error`);
    error.textContent = field.validationMessage;
    error.hidden = field.validity.valid;
    if (field.validity.valid) field.removeAttribute('aria-invalid');
    else field.setAttribute('aria-invalid', 'true');
    return field.validity.valid;
  };
  for (const field of fields) {
    field.addEventListener('input', () => {
      updateCount();
      if (field.getAttribute('aria-invalid') === 'true') validate(field);
      if (fields.every((item) => item.getAttribute('aria-invalid') !== 'true')) summary.hidden = true;
    });
  }
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const invalid = fields.filter((field) => !validate(field));
    summary.hidden = invalid.length === 0;
    if (invalid.length) {
      invalid[0].focus();
      return;
    }
    form.hidden = true;
    complete.hidden = false;
    title.textContent = 'Thank you.';
    intro.textContent = 'We appreciate you getting in touch with Peakora Network.';
    title.focus();
  });
  for (const button of dialog.querySelectorAll('[data-close-request]')) {
    button.addEventListener('click', () => dialog.close());
  }
  dialog.addEventListener('close', () => {
    form.reset();
    for (const field of fields) {
      field.setCustomValidity('');
      field.removeAttribute('aria-invalid');
      const error = doc.getElementById(`${field.id}-error`);
      error.textContent = '';
      error.hidden = true;
    }
    summary.hidden = true;
    form.hidden = false;
    complete.hidden = true;
    title.textContent = 'Compose a request';
    intro.textContent = initialIntro;
    updateCount();
  });
  for (const button of doc.querySelectorAll('[data-open-request]')) {
    button.hidden = false;
    button.addEventListener('click', () => {
      dialog.showModal();
      fields[0].focus();
    });
  }
  updateCount();
  return true;
}

export function wireCopyButtons(doc, clipboard, schedule = setTimeout, cancel = clearTimeout) {
  if (!clipboard || typeof clipboard.writeText !== 'function') return 0;
  const buttons = doc.querySelectorAll('[data-copy]');
  for (const button of buttons) {
    button.removeAttribute('hidden');
    const original = button.textContent;
    let timer;
    button.addEventListener('click', () => {
      clipboard.writeText(button.getAttribute('data-copy')).then(
        () => {
          button.textContent = 'Copied';
          button.setAttribute('data-copied', '');
          if (timer !== undefined) cancel(timer);
          timer = schedule(() => {
            timer = undefined;
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
  wireTabs(document);
  wireRequestComposer(document);
}
