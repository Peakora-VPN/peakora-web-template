import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const snippet = readFileSync(new URL('../deploy/nginx/peakora-node.conf', import.meta.url), 'utf8');
const server = readFileSync(new URL('../deploy/nginx/server.example.conf', import.meta.url), 'utf8');

const location = (source, name) => {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return source.match(new RegExp(`location\\s+${escaped}\\s*\\{([^}]+)\\}`))?.[1] ?? '';
};

test('web traffic проксируется в FastAPI, статический root больше не используется', () => {
  for (const name of ['/', '/assets/']) {
    const block = location(snippet, name);
    assert.ok(block, `нет location ${name}`);
    assert.match(block, /proxy_pass\s+http:\/\/127\.0\.0\.1:8000;/);
  }
  assert.match(snippet, /proxy_http_version\s+1\.1;/);
  assert.match(snippet, /proxy_set_header\s+Host\s+\$host;/);
  assert.match(snippet, /proxy_set_header\s+X-Real-IP\s+\$remote_addr;/);
  assert.match(snippet, /proxy_set_header\s+X-Forwarded-For\s+\$proxy_add_x_forwarded_for;/);
  assert.match(snippet, /proxy_set_header\s+X-Forwarded-Proto\s+\$scheme;/);
  assert.match(snippet, /proxy_set_header\s+Connection\s+"";/);
  assert.match(snippet, /proxy_redirect\s+off;/);
  assert.doesNotMatch(snippet, /\btry_files\b|\broot\s+\/var\/www|error_page/);
});

test('кэш соответствует нехэшированным ассетам и динамическому HTML', () => {
  assert.match(location(snippet, '/'), /Cache-Control\s+"no-cache, must-revalidate" always;/);
  assert.match(location(snippet, '/assets/'), /Cache-Control\s+"public, max-age=3600" always;/);
  assert.doesNotMatch(snippet, /^\s*expires\s+1y|^\s*add_header\s+Cache-Control[^\n]*immutable/m);
});

test('security headers присутствуют на каждом web location', () => {
  for (const name of ['/', '/assets/']) {
    const block = location(snippet, name);
    for (const header of ['X-Robots-Tag', 'X-Content-Type-Options', 'Referrer-Policy', 'Content-Security-Policy', 'Strict-Transport-Security']) {
      assert.match(block, new RegExp(header), `${name}: нет ${header}`);
    }
  }
  assert.match(snippet, /object-src 'none'/);
  assert.match(snippet, /connect-src 'none'/);
  assert.doesNotMatch(snippet, /includeSubDomains|\bpreload\b/);
  assert.match(snippet, /server_tokens\s+off;/);
});

test('gzip включён только для web, Xray сохраняет собственный gzip off', () => {
  assert.match(snippet, /gzip\s+on;/);
  assert.match(snippet, /gzip_vary\s+on;/);
  assert.equal([...server.matchAll(/gzip\s+off;/g)].length, 2);
});

test('snippet не перехватывает API и regex paths', () => {
  assert.doesNotMatch(snippet, /location\s+[~=^*]/);
  assert.doesNotMatch(snippet, /location\s+\/api\//);
});

test('оба Xray location и upstream сохранены дословно', () => {
  for (const [path, port] of [
    ['/api/v1/network/connection-lifecycle/', 8444],
    ['/api/v1/network/edge-routing/', 8445],
  ]) {
    const block = location(server, `^~ ${path}`);
    assert.ok(block, `нет ^~ ${path}`);
    for (const directive of [
      'client_max_body_size 0',
      'client_body_timeout 1h',
      'client_body_buffer_size 1m',
      'grpc_read_timeout 1h',
      'grpc_send_timeout 1h',
      'send_timeout 1h',
      'grpc_socket_keepalive on',
      'grpc_buffer_size 1m',
      'grpc_set_header Connection ""',
      'grpc_set_header Host $host',
      'grpc_set_header X-Real-IP $remote_addr',
      'grpc_set_header X-Forwarded-For $remote_addr',
      'grpc_set_header X-Forwarded-Proto $scheme',
      'access_log off',
      'error_log /dev/null crit',
      'gzip off',
      `grpc_pass grpc://127.0.0.1:${port}`,
    ]) {
      assert.ok(block.includes(`${directive};`), `${path}: нет ${directive}`);
    }
    assert.ok(server.indexOf(`location ^~ ${path}`) < server.indexOf('include /etc/nginx/snippets/peakora-node.conf;'));
  }
});

test('TLS/default_server сохранены, секреты Xray не добавлены', () => {
  assert.match(server, /listen unix:\/dev\/shm\/nginx\.sock ssl proxy_protocol;/);
  assert.match(server, /http2 on;/);
  assert.match(server, /ssl_reject_handshake on;/);
  assert.match(server, /return 444;/);
  assert.match(server, /server_name sulfur\.peakora\.cc;/);
  assert.doesNotMatch(server, /privateKey|shortIds|decryption/);
});
