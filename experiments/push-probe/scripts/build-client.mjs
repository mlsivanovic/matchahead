import * as esbuild from 'esbuild';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const shared = {
  bundle: true,
  format: 'esm',
  platform: 'browser',
  conditions: ['browser', 'module'],
  target: 'es2022',
  minify: true,
  legalComments: 'none',
};

await esbuild.build({
  ...shared,
  entryPoints: [resolve(root, 'src/client-entry.ts')],
  outfile: resolve(root, 'pwa/app.js'),
});

await esbuild.build({
  ...shared,
  entryPoints: [resolve(root, 'src/sw-entry.ts')],
  outfile: resolve(root, 'pwa/firebase-messaging-sw.js'),
});
