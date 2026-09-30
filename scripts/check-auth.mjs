import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(process.execPath, ['--experimental-strip-types', '--test', 'packages/domain/test/user-account.test.ts'], root);
run(process.execPath, ['--experimental-strip-types', '--test', 'apps/web/test/account.test.ts'], root);
run(process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit'], resolve(root, 'apps/web'));
run('firebase', [
  'emulators:exec',
  '--only',
  'auth,firestore',
  '--project',
  'demo-matchahead',
  'node --experimental-strip-types --test --test-force-exit apps/web/test/emulator/isolation.test.ts',
], root);
