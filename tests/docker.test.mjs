import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

test('Python 3.15 и зависимости зафиксированы', () => {
  assert.equal(read('.python-version').trim(), '3.15');
  assert.match(read('pyproject.toml'), /requires-python = ">=3\.15"/);
  assert.ok(read('uv.lock').length > 1000);
  assert.ok(!read('Dockerfile').includes('node:'));
});

test('Docker образ использует uv lock и запускает непривилегированный Uvicorn', () => {
  const dockerfile = read('Dockerfile');
  assert.match(dockerfile, /ghcr\.io\/astral-sh\/uv:python3\.15-trixie-slim/);
  assert.match(dockerfile, /uv sync --locked --no-dev --no-cache/);
  assert.match(dockerfile, /^USER 10001$/m);
  assert.match(dockerfile, /"--no-server-header"/);
  assert.match(dockerfile, /"--proxy-headers"/);
  assert.match(dockerfile, /"--forwarded-allow-ips"/);
});

test('Compose публикует backend только на loopback и ограничивает контейнер', () => {
  const compose = read('compose.yaml');
  assert.match(compose, /network: host/);
  assert.match(compose, /127\.0\.0\.1:8000:8000/);
  assert.match(compose, /restart: unless-stopped/);
  assert.match(compose, /read_only: true/);
  assert.match(compose, /cap_drop:/);
  assert.match(compose, /- ALL/);
  assert.match(compose, /no-new-privileges:true/);
  assert.match(compose, /tmpfs:/);
  assert.match(compose, /healthcheck:/);
  assert.match(compose, /127\.0\.0\.1:8000\/healthz/);
  assert.match(compose, /max-size: "10m"/);
});

test('Docker context исключает рабочие и секретные файлы', () => {
  const ignore = read('.dockerignore');
  for (const entry of ['.git', '.venv', '.env', 'tests', 'docs', '.superpowers']) {
    assert.ok(ignore.split(/\r?\n/).includes(entry), `.dockerignore: нет ${entry}`);
  }
});

test('pyproject не тянет Node или необъявленные runtime зависимости', () => {
  const manifest = JSON.parse(read('package.json'));
  assert.equal(manifest.dependencies, undefined);
  assert.equal(manifest.devDependencies, undefined);
  assert.equal(manifest.scripts.build, undefined);
  assert.equal(manifest.scripts.test, 'node --test');
});
