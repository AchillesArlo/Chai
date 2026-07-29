#!/usr/bin/env node
/**
 * Validates every infrastructure config file by running the real tool that
 * consumes it, inside the same pinned image production uses.
 *
 * WHY THIS EXISTS
 * Nine production bugs hid in these files because nothing ever executed them:
 * staging does not mount postgres.conf / sentinel.conf / prometheus.yml /
 * otel-collector.yaml, and production had never been started. Concretely, the
 * following all shipped and were only found by running them by hand:
 *   - postgres.conf used `--` (SQL comment) -> "FATAL: configuration file
 *     contains errors", Postgres refuses to start.
 *   - prometheus.yml declared rule_files: [alerts.yml] that compose never
 *     mounted -> config rejected, every alert rule silently absent.
 *   - otel-collector.yaml used the removed `logging` exporter -> config
 *     rejected, collector never starts.
 *   - sentinel.conf monitored a hostname without resolve-hostnames -> FATAL.
 *   - nginx.conf referenced TLS certs from a directory absent from the repo.
 * lint/typecheck/test cannot see any of this: none of it is TypeScript.
 *
 * Usage: node scripts/verify-infra-config.mjs
 * Requires Docker. Exits non-zero on the first invalid config.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');

// Pinned to match the compose files: validating against a different version
// than production runs would defeat the purpose.
const IMAGES = {
  // openssl is not in nginx:alpine (verified), so cert generation uses alpine.
  alpine: 'alpine:3.21',
  nginx: 'nginx:alpine',
  otel: 'otel/opentelemetry-collector-contrib:0.157.0',
  postgres: 'postgres:17.6-alpine',
  prometheus: 'prom/prometheus:v3.13.1',
  redis: 'redis:7.4-alpine',
};

const results = [];

function run(args) {
  return execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

// Fail fast and unambiguously when the daemon is down. Without this every
// check below reports "FAIL", which reads as "your config is broken" when the
// real cause is that Docker is not running — a misleading validator is worse
// than no validator.
try {
  run(['version', '--format', '{{.Server.Version}}']);
} catch {
  console.error(
    'Docker daemon tidak dapat dihubungi. Nyalakan Docker Desktop lalu ulangi:\n' +
      '  node scripts/verify-infra-config.mjs\n' +
      'Setiap pemeriksaan di bawah menjalankan alat aslinya di dalam container, ' +
      'jadi Docker wajib aktif.',
  );
  process.exit(2);
}

function check(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
    console.log(`  OK    ${name}`);
  } catch (error) {
    const detail = [error.stdout, error.stderr, error.message]
      .filter(Boolean)
      .join('\n')
      .trim()
      .split('\n')
      .slice(-6)
      .join('\n');
    results.push({ detail, name, ok: false });
    console.log(`  FAIL  ${name}\n${detail.replace(/^/gmu, '        ')}`);
  }
}

console.log('Validating infrastructure configs (each with its real consumer)\n');

// --- PostgreSQL -------------------------------------------------------------
// `postgres --check-config`-style validation: start with the config and let it
// parse. A syntax error is fatal and surfaces in the log, so we assert on it.
for (const env of ['production']) {
  const file = join(ROOT, 'infra', env, 'postgres.conf');
  if (!existsSync(file)) continue;
  check(`postgres.conf (${env})`, () => {
    const out = run([
      'run', '--rm',
      '-v', `${file}:/etc/postgresql/postgresql.conf:ro`,
      '-e', 'POSTGRES_PASSWORD=verify',
      '--entrypoint', 'postgres',
      IMAGES.postgres,
      '-C', 'shared_buffers',
      '-c', 'config_file=/etc/postgresql/postgresql.conf',
    ]);
    // `postgres -C <param>` parses the whole file and prints one value; a
    // syntax error makes it exit non-zero instead.
    if (!out.trim()) throw new Error('postgres -C produced no value');
  });
}

// --- nginx ------------------------------------------------------------------
// `nginx -t` resolves upstreams too, which needs the compose network, so the
// config is validated with upstream resolution stubbed via --add-host and TLS
// material supplied from a throwaway self-signed pair. What we are proving is
// that the FILE is valid and its cert paths are satisfiable.
const sslDir = mkdtempSync(join(tmpdir(), 'chai-infra-ssl-'));
try {
  run([
    'run', '--rm', '-v', `${sslDir}:/out`, IMAGES.alpine,
    'sh', '-c',
    'apk add --no-cache openssl >/dev/null 2>&1 && openssl req -x509 -newkey rsa:2048 -nodes -days 1 -keyout /out/key.pem -out /out/cert.pem -subj /CN=localhost 2>/dev/null',
  ]);
} catch (error) {
  // Without certs the nginx check below cannot distinguish "config broken"
  // from "no test cert", so fail loudly here instead of reporting a bogus
  // config failure.
  console.error('Gagal membuat sertifikat uji untuk validasi nginx:', error.message);
  process.exit(2);
}

for (const env of ['staging', 'production']) {
  const file = join(ROOT, 'infra', env, 'nginx.conf');
  if (!existsSync(file)) continue;
  check(`nginx.conf (${env})`, () => {
    // Every upstream host is pointed at 127.0.0.1 so `nginx -t` can resolve
    // them without the compose network; we are testing the file, not DNS.
    const hosts = [
      'api', 'client-portal', 'owner-console', 'realtime-gateway',
      'grafana', 'prometheus', 'kibana',
    ].flatMap((h) => ['--add-host', `${h}:127.0.0.1`]);
    run([
      'run', '--rm',
      ...hosts,
      '-v', `${file}:/etc/nginx/nginx.conf:ro`,
      '-v', `${sslDir}:/etc/nginx/ssl:ro`,
      IMAGES.nginx, 'nginx', '-t',
    ]);
  });
}

// --- Prometheus -------------------------------------------------------------
const promFile = join(ROOT, 'infra', 'monitoring', 'prometheus.yml');
const alertsFile = join(ROOT, 'infra', 'monitoring', 'alerts.yml');
if (existsSync(promFile)) {
  check('prometheus.yml + alerts.yml', () => {
    const mounts = ['-v', `${promFile}:/etc/prometheus/prometheus.yml:ro`];
    if (existsSync(alertsFile)) {
      mounts.push('-v', `${alertsFile}:/etc/prometheus/alerts.yml:ro`);
    }
    const out = run([
      'run', '--rm', ...mounts,
      '--entrypoint', 'promtool', IMAGES.prometheus,
      'check', 'config', '/etc/prometheus/prometheus.yml',
    ]);
    if (/FAILED/iu.test(out)) throw new Error(out);
  });
}

// --- OpenTelemetry collector ------------------------------------------------
const otelFile = join(ROOT, 'infra', 'monitoring', 'otel-collector.yaml');
if (existsSync(otelFile)) {
  check('otel-collector.yaml', () => {
    run([
      'run', '--rm', '-v', `${otelFile}:/etc/otel.yaml:ro`,
      IMAGES.otel, 'validate', '--config=/etc/otel.yaml',
    ]);
  });
}

// --- Redis Sentinel ---------------------------------------------------------
// Sentinel rewrites its config, so it is copied to a writable path first —
// exactly what the compose command does. Hostname resolution is stubbed.
const sentinelFile = join(ROOT, 'infra', 'production', 'sentinel.conf');
if (existsSync(sentinelFile)) {
  const scriptDir = mkdtempSync(join(tmpdir(), 'chai-infra-sentinel-'));
  const script = join(scriptDir, 'probe.sh');
  writeFileSync(
    script,
    [
      '#!/bin/sh',
      'set -e',
      'cp /etc/redis/sentinel.conf /tmp/sentinel.conf',
      'echo "sentinel auth-pass chai-master verifypass" >> /tmp/sentinel.conf',
      // Start, let it initialise, then stop. A config error exits non-zero.
      'timeout 5 redis-sentinel /tmp/sentinel.conf > /tmp/out.log 2>&1 || true',
      'grep -q "FATAL\\|Exiting" /tmp/out.log && { cat /tmp/out.log; exit 1; }',
      'grep -q "monitor master" /tmp/out.log || { cat /tmp/out.log; exit 1; }',
      'exit 0',
    ].join('\n'),
    'utf8',
  );
  try {
    check('sentinel.conf', () => {
      run([
        'run', '--rm',
        '--add-host', 'redis-master:127.0.0.1',
        '-v', `${sentinelFile}:/etc/redis/sentinel.conf:ro`,
        '-v', `${script}:/probe.sh:ro`,
        IMAGES.redis, 'sh', '/probe.sh',
      ]);
    });
  } finally {
    rmSync(scriptDir, { force: true, recursive: true });
  }
}

rmSync(sslDir, { force: true, recursive: true });

// --- Compose files ----------------------------------------------------------
for (const env of ['staging', 'production']) {
  check(`docker compose config (${env})`, () => {
    run([
      'compose',
      '-f', join(ROOT, 'infra', env, 'docker-compose.yml'),
      '--env-file', join(ROOT, 'infra', env, '.env.example'),
      'config', '--quiet',
    ]);
  });
}

const failed = results.filter((r) => !r.ok);
console.log(
  `\n${results.length - failed.length}/${results.length} config valid` +
    (failed.length ? ` — GAGAL: ${failed.map((f) => f.name).join(', ')}` : ''),
);
process.exit(failed.length > 0 ? 1 : 0);
