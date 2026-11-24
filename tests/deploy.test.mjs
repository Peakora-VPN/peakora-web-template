import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEPLOY = fileURLToPath(new URL('../deploy/', import.meta.url));
const installer = () => readFileSync(DEPLOY + 'install.sh', 'utf8');
const snippet = () => readFileSync(DEPLOY + 'nginx/peakora-node.conf', 'utf8');
const toBashPath = (p) => p.replaceAll('\\', '/').replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`);

test('файлы для Linux записаны с окончаниями LF', () => {
  for (const name of ['install.sh', 'nginx/peakora-node.conf', 'nginx/server.example.conf']) {
    assert.ok(!readFileSync(DEPLOY + name, 'utf8').includes('\r'), `${name} содержит CR`);
  }
});

test('install.sh помечен исполняемым в индексе git', () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const line = execFileSync('git', ['ls-files', '-s', 'deploy/install.sh'], { cwd: root, encoding: 'utf8' }).trim();
  if (line) assert.match(line, /^100755\s/);
});

test('установщик проверяет платформу и синтаксически корректен', () => {
  const sh = installer();
  assert.match(sh, /^#!\/usr\/bin\/env bash/);
  assert.match(sh, /set -euo pipefail/);
  assert.match(sh, /uname -s/);
  assert.match(sh, /id -u/);
  assert.match(sh, /\$NGINX_CMD -t/);
  execFileSync('bash', ['-n', DEPLOY + 'install.sh'], { stdio: 'pipe' });
});

test('установщик не ставит Docker и не настраивает daemon', () => {
  const sh = installer();
  assert.doesNotMatch(sh, /apt-get|apt\s+install|systemctl|get\.docker\.com|curl[^|]*\|\s*(?:sudo\s+)?sh/);
  assert.match(sh, /Docker не найден/);
  assert.match(sh, /Docker Compose v2 не найден/);
  assert.match(sh, /Docker daemon не запущен/);
  assert.match(sh, /docker info/);
});

test('установщик собирает и ждёт здоровый backend до nginx reload', () => {
  const sh = installer();
  assert.match(sh, /docker compose[^\n]* build/);
  assert.match(sh, /docker compose[^\n]* up -d --wait --wait-timeout 120/);
  assert.match(sh, /State\.Health\.Status/);
  assert.match(sh, /docker exec "\$DOCKER_NGINX" test -f "\$SNIPPET_DST"/);
  assert.match(sh, /HostConfig\.NetworkMode/);
  assert.ok(sh.indexOf(' up -d --wait') < sh.indexOf('$NGINX_CMD -t'));
  assert.ok(sh.indexOf('$NGINX_CMD -t') < sh.indexOf('$NGINX_CMD -s reload'));
});

test('статическая раскатка и массовый chmod удалены', () => {
  const sh = installer();
  assert.doesNotMatch(sh, /\/var\/www\/html|cp -a "\$DIST|find "\$ROOT"/);
  assert.match(sh, /--snippet-dst/);
  assert.match(sh, /--no-snippet/);
  assert.match(sh, /--nginx\b/);
});

function makeFixture({ docker = true, composeWorks = true, nginxFails = false } = {}) {
  const fixture = mkdtempSync(path.join(tmpdir(), 'peakora-install-test-'));
  mkdirSync(path.join(fixture, 'bin'));
  mkdirSync(path.join(fixture, 'deploy', 'nginx'), { recursive: true });
  mkdirSync(path.join(fixture, 'app'), { recursive: true });
  writeFileSync(path.join(fixture, 'deploy', 'install.sh'), installer());
  writeFileSync(path.join(fixture, 'deploy', 'nginx', 'peakora-node.conf'), snippet());
  for (const name of ['compose.yaml', 'Dockerfile', 'pyproject.toml', 'uv.lock']) {
    writeFileSync(path.join(fixture, name), 'fixture');
  }
  writeFileSync(path.join(fixture, 'app', 'main.py'), 'fixture');
  const scripts = {
    id: '#!/usr/bin/env bash\nprintf "0\\n"\n',
    uname: '#!/usr/bin/env bash\nprintf "Linux\\n"\n',
    'fixture-nginx': `#!/usr/bin/env bash\nprintf 'fixture-nginx %s\\n' "$*" >> "$PEAKORA_TEST_ROOT/calls.log"\n${nginxFails ? 'if [ "$1" = "-t" ]; then exit 1; fi\n' : ''}`,
  };
  const dockerScript = `#!/usr/bin/env bash
printf 'docker %s\\n' "$*" >> "$PEAKORA_TEST_ROOT/calls.log"
if [ "$1" = compose ] && [ "$2" = version ]; then ${composeWorks ? 'exit 0' : 'exit 1'}; fi
if [ "$1" = info ]; then exit 0; fi
if [ "$1" = inspect ]; then printf 'healthy\\n'; fi
exit 0
`;
  for (const [name, body] of Object.entries(scripts)) {
    writeFileSync(path.join(fixture, 'bin', name), body);
  }
  if (docker) writeFileSync(path.join(fixture, 'bin', 'docker'), dockerScript);
  return fixture;
}

function runInstaller(fixture, { withNginx = true } = {}) {
  return execFileSync('bash', ['-c', `
    export PATH="$PEAKORA_TEST_ROOT/bin:/usr/bin:/bin"
    chmod +x "$PEAKORA_TEST_ROOT"/bin/*
    bash "$PEAKORA_TEST_ROOT/deploy/install.sh" --snippet-dst "$PEAKORA_TEST_ROOT/snippet.conf" ${withNginx ? '--nginx fixture-nginx' : ''}
  `], {
    encoding: 'utf8',
    env: { ...process.env, PEAKORA_TEST_ROOT: toBashPath(fixture) },
  });
}

function cleanup(fixture) {
  assert.equal(path.dirname(path.resolve(fixture)), path.resolve(tmpdir()));
  assert.ok(path.basename(fixture).startsWith('peakora-install-test-'));
  rmSync(fixture, { recursive: true, force: true });
}

test('существующий Docker собирает и поднимает сайт, затем перезагружает nginx', () => {
  const fixture = makeFixture();
  try {
    runInstaller(fixture);
    const calls = readFileSync(path.join(fixture, 'calls.log'), 'utf8');
    assert.match(calls, /docker compose .* build/);
    assert.match(calls, /docker compose .* up -d --wait --wait-timeout 120/);
    assert.match(calls, /docker inspect .*peakora-web/);
    assert.ok(calls.indexOf('fixture-nginx -t') < calls.indexOf('fixture-nginx -s reload'));
    assert.equal(readFileSync(path.join(fixture, 'snippet.conf'), 'utf8'), snippet());
  } finally {
    cleanup(fixture);
  }
});

test('без nginx скрипт поднимает backend и устанавливает snippet без reload', () => {
  const fixture = makeFixture();
  try {
    const output = runInstaller(fixture, { withNginx: false });
    assert.match(output, /backend healthy/);
    assert.equal(readFileSync(path.join(fixture, 'snippet.conf'), 'utf8'), snippet());
    const calls = readFileSync(path.join(fixture, 'calls.log'), 'utf8');
    assert.match(calls, /docker compose .* build/);
    assert.match(calls, /docker compose .* up -d --wait --wait-timeout 120/);
    assert.doesNotMatch(calls, /fixture-nginx -s reload/);
  } finally {
    cleanup(fixture);
  }
});

test('без Docker скрипт завершается до build и nginx reload', () => {
  const fixture = makeFixture({ docker: false });
  try {
    let error;
    try { runInstaller(fixture); } catch (caught) { error = caught; }
    assert.ok(error, 'без Docker установщик обязан упасть');
    assert.match(error.stderr, /Docker не найден/);
    assert.ok(!existsSync(path.join(fixture, 'snippet.conf')));
    assert.ok(!existsSync(path.join(fixture, 'calls.log')));
  } finally {
    cleanup(fixture);
  }
});

test('без Compose v2 скрипт завершается до build и nginx reload', () => {
  const fixture = makeFixture({ composeWorks: false });
  try {
    let error;
    try { runInstaller(fixture); } catch (caught) { error = caught; }
    assert.ok(error, 'без Compose установщик обязан упасть');
    assert.match(error.stderr, /Docker Compose v2 не найден/);
    assert.ok(!existsSync(path.join(fixture, 'snippet.conf')));
    const calls = readFileSync(path.join(fixture, 'calls.log'), 'utf8');
    assert.doesNotMatch(calls, / build$| up -d|fixture-nginx -s reload/);
  } finally {
    cleanup(fixture);
  }
});

test('ошибка nginx -t восстанавливает прежний snippet и запрещает reload', () => {
  const fixture = makeFixture({ nginxFails: true });
  try {
    writeFileSync(path.join(fixture, 'snippet.conf'), 'previous config\n');
    assert.throws(() => runInstaller(fixture));
    assert.equal(readFileSync(path.join(fixture, 'snippet.conf'), 'utf8'), 'previous config\n');
    const calls = readFileSync(path.join(fixture, 'calls.log'), 'utf8');
    assert.doesNotMatch(calls, /fixture-nginx -s reload/);
  } finally {
    cleanup(fixture);
  }
});
