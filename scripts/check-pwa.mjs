import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const result = spawnSync(process.execPath, ['apps/web/scripts/check-pwa.mjs'], {
  cwd: root,
  stdio: 'inherit',
});
process.exit(result.status ?? 1);
