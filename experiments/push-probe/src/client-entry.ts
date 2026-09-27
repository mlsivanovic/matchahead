import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getMessaging, isSupported, onRegistered, onUnregistered, register, unregister, type Messaging } from 'firebase/messaging';
import { decidePermission, type ClientEnvironment } from './permission.ts';

interface PublicConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  messagingSenderId: string;
  appId: string;
  vapidKey: string;
}

interface ProbeDebug {
  permissionRequests: number;
  lastAction: string;
}

declare global {
  interface Window {
    __matchaheadProbe?: ProbeDebug;
  }
}

const debug: ProbeDebug = { permissionRequests: 0, lastAction: 'boot' };
window.__matchaheadProbe = debug;

const statusNode = document.querySelector<HTMLElement>('#status');
const detailNode = document.querySelector<HTMLElement>('#detail');
const enableButton = document.querySelector<HTMLButtonElement>('#enable');
const registerButton = document.querySelector<HTMLButtonElement>('#register-device');
const sendButton = document.querySelector<HTMLButtonElement>('#send');
const disableButton = document.querySelector<HTMLButtonElement>('#disable-push');
const enrollInput = document.querySelector<HTMLInputElement>('#enroll');

let registrationId = '';
let selfSendKey = '';
let messaging: Messaging | null = null;
let app: FirebaseApp | null = null;

function setStatus(status: string, detail: string): void {
  if (statusNode) statusNode.textContent = status;
  if (detailNode) detailNode.textContent = detail;
  debug.lastAction = status;
}

function environment(): ClientEnvironment {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return {
    secureContext: window.isSecureContext,
    notificationApi: 'Notification' in window,
    serviceWorker: 'serviceWorker' in navigator,
    pushManager: 'PushManager' in window,
    permission: 'Notification' in window ? Notification.permission : 'unknown',
    ios,
    standalone,
  };
}

function renderPermission(userClicked: boolean): ReturnType<typeof decidePermission> {
  const decision = decidePermission(environment(), userClicked);
  debug.lastAction = decision.action;
  if (enableButton) enableButton.disabled = decision.action === 'show-denied' || decision.action === 'show-unsupported' || decision.action === 'show-ios-install';
  if (decision.action === 'show-granted') {
    setStatus('Dozvola je data', decision.reason);
  } else if (decision.action === 'wait') {
    setStatus('Dozvola još nije tražena', decision.reason);
  } else {
    setStatus(decision.action === 'request' ? 'Tražim dozvolu' : 'Obaveštenja nisu uključena', decision.reason);
  }
  return decision;
}

async function loadConfig(): Promise<PublicConfig | null> {
  const response = await fetch('/config.json', { cache: 'no-store' });
  if (!response.ok) return null;
  const config = await response.json() as PublicConfig;
  if (!config.apiKey || !config.projectId || !config.appId || !config.messagingSenderId || !config.vapidKey) return null;
  return config;
}

function publicError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'nepoznata greška';
  if (message.length > 180 || /BEGIN |ya29\.|private key/i.test(message)) return 'Greška pri registraciji.';
  return message;
}

async function registerInstallation(): Promise<void> {
  const decision = renderPermission(false);
  if (decision.action !== 'show-granted') {
    setStatus('Prvo uključi obaveštenja', 'Registracija kreće tek posle dozvole i posebnog klika.');
    return;
  }
  const enroll = enrollInput?.value.trim() ?? '';
  if (!enroll) {
    setStatus('Nedostaje ključ probe', 'Upiši ključ probe. To nije Firebase privatni ključ.');
    return;
  }
  const config = await loadConfig();
  if (!config) {
    setStatus('Konfiguracija nije uneta', 'Popuni pwa/config.json javnim Firebase vrednostima i VAPID javnim ključem. Privatni ključ ne ide u ovaj fajl.');
    return;
  }
  if (!(await isSupported())) {
    setStatus('SDK nije podržan', 'firebase/messaging isSupported je vratio ne.');
    return;
  }
  const worker = await navigator.serviceWorker.ready;
  if (!app) {
    app = initializeApp({
      apiKey: config.apiKey,
      authDomain: config.authDomain,
      projectId: config.projectId,
      messagingSenderId: config.messagingSenderId,
      appId: config.appId,
    });
    messaging = getMessaging(app);
  }
  if (!messaging) return;
  const activeMessaging = messaging;
  const fid = await new Promise<string>((resolve, reject) => {
    const stop = onRegistered(activeMessaging, (installationId) => {
      stop();
      resolve(installationId);
    });
    register(activeMessaging, { vapidKey: config.vapidKey, serviceWorkerRegistration: worker }).catch((error: unknown) => {
      stop();
      reject(error);
    });
  });
  const response = await fetch('/api/registrations', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-matchahead-enroll': enroll,
    },
    body: JSON.stringify({ fid }),
  });
  if (!response.ok) {
    setStatus('Server nije prihvatio registraciju', `Odgovor ${response.status}. Identifikator nije ispisan.`);
    return;
  }
  const payload = await response.json() as { registrationId: string; selfSendKey: string };
  registrationId = payload.registrationId;
  selfSendKey = payload.selfSendKey;
  if (sendButton) sendButton.disabled = false;
  if (disableButton) disableButton.disabled = false;
  setStatus('Uređaj je registrovan', 'Identifikator je Firebase Installation ID. Stari registration token se ne čuva. Možeš poslati sintetičku poruku, pa zatvoriti aplikaciju.');
}

async function sendProbe(): Promise<void> {
  if (!registrationId || !selfSendKey) return;
  const response = await fetch('/api/probe/send', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${selfSendKey}`,
    },
    body: JSON.stringify({ registrationId }),
  });
  const payload = await response.json() as { error?: string; delivery?: string; clickPath?: string };
  if (!response.ok) {
    setStatus('Slanje nije uspelo', payload.error ?? `Odgovor ${response.status}.`);
    return;
  }
  setStatus('FCM je prihvatio poruku', `To još nije dokaz da se poruka pojavila na uređaju. Zatvori PWA. Klik treba da otvori ${payload.clickPath ?? '/poruka.html'}.`);
}

async function disableProbe(): Promise<void> {
  if (messaging) {
    const activeMessaging = messaging;
    await new Promise<void>((resolve) => {
      const stop = onUnregistered(activeMessaging, () => {
        stop();
        resolve();
      });
      unregister(activeMessaging).catch(() => {
        stop();
        resolve();
      });
    });
  }
  if (registrationId && selfSendKey) {
    await fetch(`/api/registrations/${registrationId}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${selfSendKey}` },
    });
  }
  registrationId = '';
  selfSendKey = '';
  if (sendButton) sendButton.disabled = true;
  if (disableButton) disableButton.disabled = true;
  setStatus('Uređaj je isključen', 'Ova instalacija više nije registrovana za probu.');
}

enableButton?.addEventListener('click', async () => {
  if (!enableButton || enableButton.disabled) return;
  const decision = renderPermission(true);
  if (!decision.request) return;
  enableButton.disabled = true;
  debug.permissionRequests += 1;
  const result = await Notification.requestPermission();
  debug.lastAction = result;
  renderPermission(false);
});

registerButton?.addEventListener('click', () => {
  registerInstallation().catch((error: unknown) => {
    setStatus('Registracija nije završena', publicError(error));
  });
});

sendButton?.addEventListener('click', () => {
  sendProbe().catch((error: unknown) => {
    setStatus('Slanje nije završeno', publicError(error));
  });
});

disableButton?.addEventListener('click', () => {
  disableProbe().catch((error: unknown) => {
    setStatus('Isključivanje nije završeno', publicError(error));
  });
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/firebase-messaging-sw.js', { type: 'module', scope: '/' }).catch(() => {
    setStatus('Service worker nije registrovan', 'Proveri da je firebase-messaging-sw.js izgrađen i da je stranica na HTTPS ili localhost.');
  });
}

fetch('/api/probe/status').then(async (response) => {
  if (!response.ok) return;
  const status = await response.json() as { enabled?: boolean };
  const note = document.querySelector<HTMLElement>('#server-note');
  if (note) note.textContent = status.enabled ? 'Probni server je uključen.' : 'Probni server je isključen dok PROBE_SEND_ENABLED nije 1.';
}).catch(() => undefined);

renderPermission(false);
