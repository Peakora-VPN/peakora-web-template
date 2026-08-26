import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DEPLOY = fileURLToPath(new URL('../deploy/', import.meta.url));
const snippet = () => readFileSync(DEPLOY + 'nginx/peakora-node.conf', 'utf8');
const installer = () => readFileSync(DEPLOY + 'install.sh', 'utf8');

test('файлы для Linux записаны с окончаниями LF', () => {
  assert.ok(!installer().includes('\r'), 'install.sh содержит CR — на ноде он не запустится');
  assert.ok(!snippet().includes('\r'), 'фрагмент nginx содержит CR');
});

test('фрагмент закрывает дефолтную страницу nginx и задаёт кэш', () => {
  const conf = snippet();
  assert.match(conf, /root\s+\/var\/www\/html;/);
  assert.match(conf, /server_tokens\s+off;/);
  assert.match(conf, /error_page\s+404\s+\/404\.html;/);
  assert.match(conf, /location\s+=\s+\/404\.html\s*\{[^}]*internal;/);
  assert.match(conf, /try_files\s+\$uri\s+\$uri\/\s+=404;/);
  assert.match(conf, /expires\s+1y;/);
  assert.match(conf, /Cache-Control\s+"no-cache, must-revalidate"/);
  assert.match(conf, /Content-Security-Policy/);
});

// В nginx первый же add_header внутри location отменяет все унаследованные
// с уровня server — заголовки обязаны быть в каждом блоке, иначе молча пропадут.
test('каждый location несёт свои заголовки', () => {
  // Комментарии убираются до разбора: слово «location» встречается и в них.
  const directives = snippet().replace(/^[ \t]*#.*$/gm, '');
  const blocks = directives.split(/\blocation\b/).slice(1);
  assert.ok(blocks.length >= 3, 'ожидались блоки /assets/, / и = /404.html');
  for (const [i, block] of blocks.entries()) {
    assert.match(block, /X-Robots-Tag/, `location #${i + 1} без X-Robots-Tag`);
    assert.match(block, /X-Content-Type-Options/, `location #${i + 1} без nosniff`);
  }
});

// Git на Windows не хранит бит исполнения сам: если режим в индексе слетит на
// 100644, после клона на ноду скрипт откажется запускаться — Permission denied.
test('install.sh помечен исполняемым в индексе git', () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  let line;
  try {
    line = execFileSync('git', ['ls-files', '-s', 'deploy/install.sh'], {
      cwd: root,
      encoding: 'utf8',
    }).trim();
  } catch {
    return; // не git-репозиторий: проверять нечего
  }
  if (line === '') return; // файл ещё не добавлен в индекс
  assert.match(line, /^100755\s/, `режим ${line.split(/\s/)[0]}, а нужен 100755`);
});

test('установщик синтаксически корректен и защищён от частичного выполнения', () => {
  const sh = installer();
  assert.match(sh, /^#!\/usr\/bin\/env bash/);
  assert.match(sh, /set -euo pipefail/);
  assert.match(sh, /\$NGINX_CMD -t/, 'конфигурация должна проверяться перед перезагрузкой');
  execFileSync('bash', ['-n', DEPLOY + 'install.sh'], { stdio: 'pipe' });
});

// На ноде nginx крутится в контейнере: бинарника в PATH нет, а фрагмент,
// положенный на хост, внутри контейнера может не существовать. Обе ситуации
// установщик обязан пережить, не стирая уже сделанную работу.
test('установщик готов к nginx в контейнере', () => {
  const sh = installer();
  assert.match(sh, /--snippet-dst/, 'путь фрагмента должен настраиваться');
  assert.match(sh, /--nginx\b/, 'команда вызова nginx должна настраиваться');
  assert.match(sh, /docker ps/, 'контейнер с nginx должен находиться сам');
  assert.match(
    sh,
    /docker exec "\$DOCKER_NGINX" test -f "\$SNIPPET_DST"/,
    'видимость фрагмента внутри контейнера нужно проверять, а не угадывать по путям',
  );
});

test('ненайденный nginx не приводит к откату фрагмента', () => {
  const sh = installer();
  // Ветка «nginx не найден» обязана заканчиваться предупреждением, а не rm.
  const branch = sh.slice(sh.indexOf('    # Фрагмент инертен'));
  assert.ok(branch.length > 0, 'нет ветки с ненайденным nginx');
  assert.doesNotMatch(branch, /rm -f "\$SNIPPET_DST"/, 'фрагмент стирать нельзя: он инертен');
  assert.match(branch, /ВНИМАНИЕ/, 'пользователю нужно сказать, что проверка не выполнялась');
});
