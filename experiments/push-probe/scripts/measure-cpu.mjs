import { generateKeyPairSync } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { Miniflare } from 'miniflare';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist/worker.js');
const enroll = 'measure-a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4';

function pemFromNode() {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function summary(values) {
  return {
    samples: values.length,
    min: Math.min(...values),
    median: median(values),
    max: Math.max(...values),
  };
}

async function dispatch(mf, phase) {
  const response = await mf.dispatchFetch('https://probe.local/api/probe/measure', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-matchahead-enroll': enroll,
    },
    body: JSON.stringify({ phase }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${phase} ${response.status} ${text}`);
  if (text.includes('BEGIN PRIVATE KEY') || text.includes(enroll)) {
    throw new Error(`${phase} je vratio tajnu`);
  }
  return JSON.parse(text);
}

function workerOptions(pem) {
  const source = readFileSync(dist, 'utf8');
  return {
    workers: [{
      config: {
        name: 'matchahead-push-probe',
        compatibilityDate: '2026-09-27',
        manifest: {
          mainModule: 'worker.js',
          modules: {
            'worker.js': { type: 'esm', contents: source },
          },
        },
        env: {
          PROBE_SEND_ENABLED: { type: 'text', value: '1' },
          PROBE_ENROLL_SECRET: { type: 'text', value: enroll },
          FIREBASE_PROJECT_ID: { type: 'text', value: 'matchahead-probe' },
          FCM_CLIENT_EMAIL: { type: 'text', value: 'probe@matchahead-probe.iam.gserviceaccount.com' },
          FCM_PRIVATE_KEY: { type: 'text', value: pem },
        },
      },
    }],
  };
}

await esbuild.build({
  entryPoints: [resolve(root, 'src/worker.ts')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  outfile: dist,
  legalComments: 'none',
});

const pem = pemFromNode();
const coldSign = [];
for (let index = 0; index < 5; index += 1) {
  const mf = new Miniflare(workerOptions(pem));
  try {
    const body = await dispatch(mf, 'sign');
    coldSign.push(body.signMs);
  } finally {
    await mf.dispose();
  }
}

const warmIsolate = new Miniflare(workerOptions(pem));
const warmSign = [];
const refreshSign = [];
const refreshExchange = [];
let timer = null;
let firestore = null;
try {
  for (let index = 0; index < 5; index += 1) {
    const body = await dispatch(warmIsolate, 'warm');
    if (body.action !== 'warm-noop' || body.signMs !== 0) {
      throw new Error(`topli put nije preskočio potpis: ${JSON.stringify(body)}`);
    }
    warmSign.push(body.signMs);
  }
  for (let index = 0; index < 3; index += 1) {
    const body = await dispatch(warmIsolate, 'refresh');
    refreshSign.push(body.signMs);
    refreshExchange.push(body.exchangeMs);
  }
  timer = await dispatch(warmIsolate, 'timer');
  firestore = await dispatch(warmIsolate, 'firestore-parse');
} finally {
  await warmIsolate.dispose();
}

const bundleBytes = readFileSync(dist).length;
const report = {
  runtime: 'workerd-local-via-miniflare',
  edgeCpu: 'NOT_TESTED',
  freeCpuLimitMs: 10,
  timerAdvancesDuringCpu: timer.timerAdvancesDuringCpu,
  timerDeltaMs: timer.deltaMs,
  coldSignMs: summary(coldSign),
  warmSignMs: summary(warmSign),
  refreshSignMs: summary(refreshSign),
  refreshExchangeMs: summary(refreshExchange),
  firestoreParseMs: firestore.parseMs,
  firestoreLive: firestore.firestoreLive,
  bundleBytes,
  coldSignFitsTenMs: coldSign.every((value) => value < 10),
  refreshSignFitsTenMs: refreshSign.every((value) => value < 10),
  note: 'signMs je lokalno performance.now oko WebCrypto potpisa. exchangeMs uključuje namerno čekanje od 40 ms i nije CPU. Ovo nije cpuTime sa Cloudflare edge-a.',
};

mkdirSync('/tmp', { recursive: true });
writeFileSync('/tmp/matchahead-push-measure.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
