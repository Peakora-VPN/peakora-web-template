#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
import { copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const SRC = join(ROOT, 'src');
const ASSETS = join(SRC, 'assets');
const DIST = join(ROOT, 'dist');
const DIST_ASSETS = join(DIST, 'assets');

const hash = (data) => createHash('sha256').update(data).digest('hex').slice(0, 8);

// Только комментарии и пробелы, без трогания «:» и «,»: агрессивная минификация
// CSS ломается о медиазапросы и значения вроде clamp() чаще, чем экономит байты.
const minifyCss = (css) =>
  css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{};])\s*/g, '$1')
    .trim();

const stripHtmlComments = (html) => html.replace(/<!--[\s\S]*?-->/g, '');

async function emit(name, data) {
  const dot = name.lastIndexOf('.');
  const hashed = `${name.slice(0, dot)}.${hash(data)}${name.slice(dot)}`;
  await writeFile(join(DIST_ASSETS, hashed), data);
  return `/assets/${hashed}`;
}

await rm(DIST, { recursive: true, force: true });
await mkdir(DIST_ASSETS, { recursive: true });

// 1. Шрифты — первыми, на них ссылается CSS.
const fontsDir = join(ASSETS, 'fonts');
const fontUrls = new Map();
if (existsSync(fontsDir)) {
  for (const name of readdirSync(fontsDir).filter((f) => extname(f) === '.woff2')) {
    fontUrls.set(name, await emit(name, await readFile(join(fontsDir, name))));
  }
}

// 2. CSS — с переписанными путями к шрифтам.
let css = await readFile(join(SRC, 'styles.css'), 'utf8');
for (const [name, url] of fontUrls) {
  css = css.split(`/assets/fonts/${name}`).join(url);
}
const cssUrl = await emit('styles.css', minifyCss(css));

// 3. lib.js, затем app.js с переписанным спецификатором импорта.
const libUrl = await emit('lib.js', await readFile(join(SRC, 'lib.js'), 'utf8'));
const libFile = libUrl.slice('/assets/'.length);
const app = (await readFile(join(SRC, 'app.js'), 'utf8')).replace(
  /(from\s+['"])\.\/lib\.js(['"])/,
  `$1./${libFile}$2`,
);
const appUrl = await emit('app.js', app);

// 4. HTML.
const logo = (await readFile(join(ASSETS, 'logo.svg'), 'utf8')).trim();
const year = String(new Date().getFullYear());
for (const page of ['index.html', '404.html']) {
  let html = await readFile(join(SRC, page), 'utf8');
  html = html.replace('<!--LOGO-->', logo);
  html = stripHtmlComments(html);
  html = html.split('/assets/styles.css').join(cssUrl);
  html = html.split('/assets/app.js').join(appUrl);
  html = html.split('{{YEAR}}').join(year);
  await writeFile(join(DIST, page), html);
}

// 5. Файлы, которые должны лежать в корне.
for (const name of ['favicon.svg', 'favicon.png', 'apple-touch-icon.png', 'robots.txt']) {
  const from = join(ASSETS, name);
  if (existsSync(from)) await copyFile(from, join(DIST, name));
}

// 6. Отчёт.
const listing = [];
const walk = (dir, prefix = '') => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) walk(join(dir, entry.name), `${prefix}${entry.name}/`);
    else listing.push(`${prefix}${entry.name}`);
  }
};
walk(DIST);
let total = 0;
for (const name of listing.sort()) {
  const { size } = await stat(join(DIST, name));
  total += size;
  console.log(`  ${String(size).padStart(7)} B  ${name}`);
}
console.log(`  ${String(total).padStart(7)} B  ИТОГО`);
