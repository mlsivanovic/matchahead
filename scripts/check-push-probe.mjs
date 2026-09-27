import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const probe = resolve(root, 'experiments/push-probe');

function run(command, args) {
  const result = spawnSync(command, args, { cwd: probe, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run('npm', ['run', 'check']);
run('node', ['scripts/build-client.mjs']);

for (const relative of ['pwa/app.js', 'pwa/firebase-messaging-sw.js', 'src/worker.ts', 'src/app.ts']) {
  const source = readFileSync(resolve(probe, relative), 'utf8');
  if (source.includes('BEGIN PRIVATE KEY') || source.includes('BEGIN RSA PRIVATE KEY')) {
    console.error(`${relative} sadrži privatni ključ`);
    process.exit(1);
  }
}

const clientSource = readFileSync(resolve(probe, 'src/client-entry.ts'), 'utf8');
if (clientSource.includes('getToken') || clientSource.includes('deleteToken')) {
  console.error('klijent zove stari token API');
  process.exit(1);
}
