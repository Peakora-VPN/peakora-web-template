#!/usr/bin/env node
// Разовая выкачка подмножеств шрифтов с Google Fonts в src/assets/fonts/.
// В сборке НЕ участвует: dist собирается из уже скачанных файлов.
// stdout — готовый блок @font-face, stderr — имена и размеры файлов.
//
// Берётся только подмножество latin. Проверено, что его unicode-range покрывает
// и все строки страницы, и все английские названия регионов из ICU (включая
// Curaçao, Åland Islands, Côte d’Ivoire, São Tomé & Príncipe, Türkiye): диакритика
// живёт в U+0000-00FF, типографская апострофа U+2019 — в U+2000-206F.
// latin-ext добавил бы 182 KB ради нуля видимых глифов.
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../src/assets/fonts/', import.meta.url));
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const WANTED = [
  { family: 'Inter', weights: [400, 500], slug: 'inter' },
  { family: 'Space Grotesk', weights: [600], slug: 'space-grotesk' },
  // Утилитарное начертание для подписей, фаз и чисел — язык предметной области.
  { family: 'JetBrains Mono', weights: [500], slug: 'jetbrains-mono' },
];
const SUBSETS = ['latin'];

await mkdir(OUT, { recursive: true });

const faces = [];
let total = 0;

for (const { family, weights, slug } of WANTED) {
  const spec = `${family.replace(/ /g, '+')}:wght@${weights.join(';')}`;
  const cssUrl = `https://fonts.googleapis.com/css2?family=${spec}&display=swap`;
  const css = await (await fetch(cssUrl, { headers: { 'user-agent': UA } })).text();

  // Google размечает блоки комментарием с именем подмножества. Вариативный шрифт
  // отдаётся одним файлом на несколько весов — группируем по URL, чтобы не
  // скачать один и тот же файл дважды под разными именами.
  const byUrl = new Map();
  for (const block of css.split('/*').slice(1)) {
    const subset = block.slice(0, block.indexOf('*/')).trim();
    if (!SUBSETS.includes(subset)) continue;

    const weight = Number(block.match(/font-weight:\s*(\d+)/)?.[1]);
    const url = block.match(/src:\s*url\((https:[^)]+\.woff2)\)/)?.[1];
    const range = block.match(/unicode-range:\s*([^;]+);/)?.[1]?.trim();
    if (!weights.includes(weight) || !url || !range) continue;

    if (!byUrl.has(url)) byUrl.set(url, { subset, range, weights: [] });
    byUrl.get(url).weights.push(weight);
  }

  // Имя без веса, если на подмножество приходится ровно один файл.
  const perSubset = new Map();
  for (const { subset } of byUrl.values()) perSubset.set(subset, (perSubset.get(subset) ?? 0) + 1);

  for (const [url, { subset, range, weights: ws }] of byUrl) {
    const name =
      perSubset.get(subset) === 1
        ? `${slug}-${subset}.woff2`
        : `${slug}-${ws[0]}-${subset}.woff2`;

    const bytes = Buffer.from(await (await fetch(url)).arrayBuffer());
    await writeFile(OUT + name, bytes);
    total += bytes.length;
    console.error(`${name.padEnd(30)} ${String(bytes.length).padStart(6)} B  вес ${ws.join(', ')}`);

    const min = Math.min(...ws);
    const max = Math.max(...ws);
    faces.push(
      [
        '@font-face {',
        `  font-family: "${family}";`,
        '  font-style: normal;',
        `  font-weight: ${min === max ? min : `${min} ${max}`};`,
        '  font-display: swap;',
        `  src: url(/assets/fonts/${name}) format("woff2");`,
        `  unicode-range: ${range};`,
        '}',
      ].join('\n'),
    );
  }
}

console.error(`${'ИТОГО'.padEnd(30)} ${String(total).padStart(6)} B  (бюджет 102400)`);
console.log(faces.join('\n'));
