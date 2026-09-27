export type BrowserPermission = 'default' | 'denied' | 'granted';

export interface ClientEnvironment {
  secureContext: boolean;
  notificationApi: boolean;
  serviceWorker: boolean;
  pushManager: boolean;
  permission: BrowserPermission | 'unknown';
  ios: boolean;
  standalone: boolean;
}

export type PermissionAction =
  | 'show-unsupported'
  | 'show-ios-install'
  | 'show-denied'
  | 'show-granted'
  | 'wait'
  | 'request';

export interface PermissionDecision {
  action: PermissionAction;
  request: boolean;
  reason: string;
}

export function decidePermission(environment: ClientEnvironment, userClicked: boolean): PermissionDecision {
  if (!environment.secureContext) {
    return {
      action: 'show-unsupported',
      request: false,
      reason: 'Push radi samo preko HTTPS ili na localhost.',
    };
  }
  if (!environment.notificationApi || !environment.serviceWorker || !environment.pushManager) {
    return {
      action: 'show-unsupported',
      request: false,
      reason: 'Ovaj browser nema Notification, service worker ili PushManager.',
    };
  }
  if (environment.ios && !environment.standalone) {
    return {
      action: 'show-ios-install',
      request: false,
      reason: 'Na iPhone-u i iPad-u prvo dodaj MatchAhead na početni ekran, otvori instaliranu aplikaciju, pa tek onda traži dozvolu. Safari kartica ne prima push.',
    };
  }
  if (environment.permission === 'denied') {
    return {
      action: 'show-denied',
      request: false,
      reason: 'Dozvola je odbijena. MatchAhead je ne traži ponovo. Uključi obaveštenja u podešavanjima browsera, pa se vrati.',
    };
  }
  if (environment.permission === 'granted') {
    return {
      action: 'show-granted',
      request: false,
      reason: 'Dozvola je već data. Registraciju i dalje pokreće poseban klik.',
    };
  }
  if (environment.permission !== 'default') {
    return {
      action: 'show-unsupported',
      request: false,
      reason: 'Browser nije vratio prepoznato stanje dozvole.',
    };
  }
  if (!userClicked) {
    return {
      action: 'wait',
      request: false,
      reason: 'Dozvola se traži samo na klik.',
    };
  }
  return {
    action: 'request',
    request: true,
    reason: 'Korisnik je kliknuo i dozvola još nije odlučena.',
  };
}
