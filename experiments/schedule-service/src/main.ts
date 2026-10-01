import { createFirebaseVerifier, FIREBASE_CERT_URL } from './auth.ts';
import { systemClock } from './clock.ts';
import { createScheduleServer } from './http.ts';
import { DEFAULT_QUOTA_LIMITS, QuotaBook } from './quota.ts';
import { assertScheduleMode } from './service.ts';
import { createProductionSource } from './sources/production.ts';
import { FileScheduleStore } from './store.ts';

const mode = assertScheduleMode(process.env.SCHEDULE_MODE ?? 'production', process.env.NODE_ENV);
const projectId = process.env.FIREBASE_PROJECT_ID ?? '';
const directory = process.env.SCHEDULE_STORE_DIR ?? '';
if (!projectId || !directory) {
  process.stderr.write('FIREBASE_PROJECT_ID i SCHEDULE_STORE_DIR su obavezni.\n');
  process.exit(1);
}
const host = process.env.SCHEDULE_BIND_HOST ?? '127.0.0.1';
const port = Number(process.env.SCHEDULE_PORT ?? '8787');
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  process.stderr.write('SCHEDULE_PORT nije ispravan.\n');
  process.exit(1);
}
const origins = (process.env.SCHEDULE_ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

const server = createScheduleServer({
  clock: systemClock(),
  verifier: createFirebaseVerifier({
    projectId,
    fetchCerts: async () => {
      const response = await fetch(FIREBASE_CERT_URL);
      if (!response.ok) throw new Error('Sertifikati za prijavu nisu pročitani.');
      return (await response.json()) as Record<string, string>;
    },
  }),
  store: new FileScheduleStore(directory),
  quota: new QuotaBook(directory, DEFAULT_QUOTA_LIMITS),
  source: createProductionSource(),
  origins,
  mode,
  trustProxy: process.env.SCHEDULE_TRUST_PROXY === '1',
  logger: (event) => {
    process.stdout.write(`${JSON.stringify({ status: event.status, code: event.code, teamId: event.teamId })}\n`);
  },
});

server.listen(port, host, () => {
  process.stdout.write(`schedule-service ${host}:${port} mode=${mode}\n`);
});
