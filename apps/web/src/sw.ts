import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

import { isSensitiveUrl, PUBLIC_SCHEDULE_CACHE, shouldDeleteCacheOnActivate } from './logic/cache-policy.ts';

/**
 * Jedini service worker ovog scope-a: offline omotač i budući FCM.
 * Oznaka: matchahead-shell-and-future-fcm.
 * Faza 09 sme da uveze Firebase messaging samo u ovu datoteku i samo uz
 * registraciju koju stranica već drži. Ne dodavati firebase-messaging-sw.js
 * i ne zvati getToken(). Faza 02 i dalje nije završena.
 */

interface WorkerScope {
  registration: { scope: string };
  skipWaiting(): Promise<void>;
  clients: { claim(): Promise<void> };
  addEventListener(type: string, listener: (event: WorkerEvent) => void): void;
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
}

interface WorkerEvent {
  request?: Request;
  data?: { type?: string };
  waitUntil(promise: Promise<unknown>): void;
  respondWith(response: Promise<Response> | Response): void;
  stopImmediatePropagation(): void;
}

const worker = self as unknown as WorkerScope;
// Workbox traži doslovni izraz self.__WB_MANIFEST u izgrađenom workeru.
const manifest = (self as unknown as WorkerScope).__WB_MANIFEST;

worker.addEventListener('fetch', (event) => {
  const request = event.request;
  if (!request) return;
  const sensitive = isSensitiveUrl(request.url) || request.headers.has('authorization');
  if (!sensitive) return;
  event.stopImmediatePropagation();
  event.respondWith(fetch(request, { cache: 'no-store' }));
});

worker.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void worker.skipWaiting();
  if (event.data?.type === 'matchahead-shell-and-future-fcm') return;
});

worker.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names.filter((name) => shouldDeleteCacheOnActivate(name)).map((name) => caches.delete(name)),
    );
    await mirrorPublicSchedule();
    await worker.clients.claim();
  })());
});

precacheAndRoute(manifest);
cleanupOutdatedCaches();

const indexEntry = manifest.find((entry) => entry.url === 'index.html' || entry.url.endsWith('/index.html'));
if (indexEntry) {
  registerRoute(new NavigationRoute(createHandlerBoundToURL(indexEntry.url), {
    denylist: [/oauth/i, /googleapis\.com/i, /accounts\.google\.com/i, /identitytoolkit/i, /securetoken/i],
  }));
}

async function mirrorPublicSchedule(): Promise<void> {
  const names = await caches.keys();
  const precacheName = names.find((name) => name.startsWith('workbox-precache'));
  if (!precacheName) return;
  const precache = await caches.open(precacheName);
  const requests = await precache.keys();
  const scheduleRequest = requests.find((request) => request.url.includes('/data/demo-schedule.json'));
  if (!scheduleRequest) return;
  const response = await precache.match(scheduleRequest);
  if (!response) return;
  const mirror = await caches.open(PUBLIC_SCHEDULE_CACHE);
  await mirror.put(scheduleRequest, response.clone());
}
