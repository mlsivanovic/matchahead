import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const serviceDir = resolve(root, 'experiments/schedule-service');
const tsc = resolve(serviceDir, 'node_modules/typescript/lib/tsc.js');
const typecheck = spawnSync(process.execPath, [tsc, '-p', serviceDir, '--noEmit', '--pretty', 'false'], {
  cwd: root,
  stdio: 'inherit',
});
if (typecheck.status !== 0) {
  process.exit(typecheck.status ?? 1);
}
const testDir = resolve(serviceDir, 'test');
const testFiles = readdirSync(testDir)
  .filter((name) => name.endsWith('.test.ts'))
  .map((name) => resolve(testDir, name));
const result = spawnSync(process.execPath, ['--experimental-strip-types', '--test', ...testFiles], {
  cwd: root,
  stdio: 'inherit',
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
