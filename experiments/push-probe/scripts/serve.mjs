import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProbeApp } from '../src/app.ts';

const root = fileURLToPath(new URL('../pwa/', import.meta.url));
const port = Number(process.env.PORT ?? 4173);
const app = createProbeApp();
const env = {
  PROBE_SEND_ENABLED: process.env.PROBE_SERVE_USE_ENV === '1' ? process.env.PROBE_SEND_ENABLED : '',
  PROBE_ENROLL_SECRET: process.env.PROBE_SERVE_USE_ENV === '1' ? process.env.PROBE_ENROLL_SECRET : '',
  FIREBASE_PROJECT_ID: process.env.PROBE_SERVE_USE_ENV === '1' ? process.env.FIREBASE_PROJECT_ID : '',
  FCM_CLIENT_EMAIL: process.env.PROBE_SERVE_USE_ENV === '1' ? process.env.FCM_CLIENT_EMAIL : '',
  FCM_PRIVATE_KEY: process.env.PROBE_SERVE_USE_ENV === '1' ? process.env.FCM_PRIVATE_KEY : '',
  PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL,
};

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
};

function nodeToWeb(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      const headers = new Headers();
      for (const [key, value] of Object.entries(request.headers)) {
        if (Array.isArray(value)) {
          for (const item of value) headers.append(key, item);
        } else if (value !== undefined) {
          headers.set(key, value);
        }
      }
      const init = { method: request.method, headers };
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        init.body = Buffer.concat(chunks);
      }
      resolve(new Request(`http://${request.headers.host}${request.url}`, init));
    });
    request.on('error', reject);
  });
}

createServer(async (request, response) => {
  try {
    const webRequest = await nodeToWeb(request);
    const url = new URL(webRequest.url);
    if (url.pathname.startsWith('/api/')) {
      const result = await app.fetch(webRequest, env);
      response.writeHead(result.status, Object.fromEntries(result.headers));
      response.end(Buffer.from(await result.arrayBuffer()));
      return;
    }
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const filePath = join(root, relative === '' ? 'index.html' : relative);
    const rootPrefix = root.endsWith(sep) ? root : `${root}${sep}`;
    if (filePath !== root && !filePath.startsWith(rootPrefix)) {
      response.writeHead(403);
      response.end('Zabranjena putanja.');
      return;
    }
    const body = await readFile(filePath);
    response.writeHead(200, {
      'content-type': types[extname(filePath)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
      'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self' https://*.googleapis.com https://firebaseinstallations.googleapis.com https://fcmregistrations.googleapis.com; worker-src 'self'; manifest-src 'self'; base-uri 'self'; form-action 'self'",
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
    });
    response.end(body);
  } catch (error) {
    const missing = error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT';
    response.writeHead(missing ? 404 : 500);
    response.end(missing ? 'Nema datoteke.' : 'Greška servera.');
  }
}).listen(port, '127.0.0.1');
