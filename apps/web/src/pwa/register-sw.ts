import { isComposingElement, mayApplyUpdate } from '../logic/update-policy.ts';

/**
 * Jedina registracija proizvoda. Vite PWA plugin je podešen da sam ne
 * registruje worker. Firebase kasnije dobija ovaj objekat i ne sme da
 * traži drugi fajl na istom scope-u.
 */

export interface UpdateSnapshot {
  ready: boolean;
  blockedMessage: string | null;
}

type Listener = () => void;

let registrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;
let waitingWorker: ServiceWorker | null = null;
let blockedMessage: string | null = null;
let userAccepted = false;
let reloading = false;
let blocker: () => { composing: boolean; draftDirty: boolean } = () => ({ composing: false, draftDirty: false });
let current: UpdateSnapshot = { ready: false, blockedMessage: null };
const listeners = new Set<Listener>();

export function setUpdateBlocker(next: () => { composing: boolean; draftDirty: boolean }): void {
  blocker = next;
}

export function getUpdateSnapshot(): UpdateSnapshot {
  return current;
}

export function subscribeUpdate(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function registerProductServiceWorker(baseUrl: string): Promise<ServiceWorkerRegistration | null> {
  if (registrationPromise) return registrationPromise;
  registrationPromise = registerOnce(baseUrl);
  return registrationPromise;
}

export function applyReadyUpdate(): void {
  if (!waitingWorker) return;
  const decision = blocker();
  if (!mayApplyUpdate(decision)) {
    blockedMessage = 'Unos je u toku. Nova verzija čeka. Stranica se ne učitava ponovo.';
    emit();
    return;
  }
  blockedMessage = null;
  userAccepted = true;
  waitingWorker.postMessage({ type: 'SKIP_WAITING' });
  emit();
}

function emit(): void {
  const next = { ready: waitingWorker !== null, blockedMessage };
  if (next.ready === current.ready && next.blockedMessage === current.blockedMessage) return;
  current = next;
  for (const listener of listeners) listener();
}

async function registerOnce(baseUrl: string): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  const registration = await navigator.serviceWorker.register(`${baseUrl}sw.js`, { scope: baseUrl });
  watch(registration);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!userAccepted || reloading) return;
    if (!mayApplyUpdate(blocker())) return;
    reloading = true;
    window.location.reload();
  });
  return registration;
}

function watch(registration: ServiceWorkerRegistration): void {
  if (registration.waiting && navigator.serviceWorker.controller) {
    waitingWorker = registration.waiting;
    emit();
  }
  registration.addEventListener('updatefound', () => {
    const installing = registration.installing;
    if (!installing) return;
    installing.addEventListener('statechange', () => {
      if (installing.state === 'installed' && navigator.serviceWorker.controller) {
        waitingWorker = registration.waiting;
        emit();
      }
    });
  });
}

export function composingFromDocument(doc: Document): { composing: boolean; draftDirty: boolean } {
  return {
    composing: isComposingElement(doc.activeElement instanceof HTMLElement ? doc.activeElement : null),
    draftDirty: doc.querySelector('[data-draft-dirty="true"]') !== null,
  };
}
