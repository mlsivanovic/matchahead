import { initializeApp } from 'firebase/app';
import { getMessaging } from 'firebase/messaging/sw';

const worker = self as unknown as ServiceWorkerGlobalScope;

worker.addEventListener('install', (event) => {
  event.waitUntil(worker.skipWaiting());
});

worker.addEventListener('activate', (event) => {
  event.waitUntil(worker.clients.claim());
});

async function boot(): Promise<void> {
  const response = await fetch(new URL('config.json', worker.registration.scope), { cache: 'no-store' });
  if (!response.ok) return;
  const config = await response.json() as {
    apiKey?: string;
    authDomain?: string;
    projectId?: string;
    messagingSenderId?: string;
    appId?: string;
  };
  if (!config.apiKey || !config.projectId || !config.messagingSenderId || !config.appId) return;
  const app = initializeApp({
    apiKey: config.apiKey,
    authDomain: config.authDomain ?? '',
    projectId: config.projectId,
    messagingSenderId: config.messagingSenderId,
    appId: config.appId,
  });
  getMessaging(app);
}

void boot();
