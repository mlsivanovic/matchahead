export type RouteId = 'home' | 'mine' | 'clubs' | 'settings';

/** Hash rute ne traže serverski fallback na GitHub Pages. */
export function parseRoute(hash: string): RouteId {
  const raw = hash.replace(/^#/, '').replace(/^\//, '').split(/[?#]/, 1)[0]?.replace(/\/$/, '') ?? '';
  if (raw === '' || raw === 'pocetna') return 'home';
  if (raw === 'moje' || raw === 'utakmice') return 'mine';
  if (raw === 'klubovi') return 'clubs';
  if (raw === 'podesavanja') return 'settings';
  return 'home';
}

export function routeHash(route: RouteId): string {
  if (route === 'home') return '#/';
  if (route === 'mine') return '#/moje';
  if (route === 'clubs') return '#/klubovi';
  return '#/podesavanja';
}

export function routeNavLabel(route: RouteId): string {
  if (route === 'mine') return 'Utakmice';
  return routeTitle(route);
}

export function routeTitle(route: RouteId): string {
  if (route === 'home') return 'Početna';
  if (route === 'mine') return 'Moje utakmice';
  if (route === 'clubs') return 'Klubovi';
  return 'Podešavanja';
}

/** Tri taba. Početna i stare rute utakmica dele „Utakmice”. */
export type AppTab = 'matches' | 'clubs' | 'settings';

export const NAV_TABS: readonly AppTab[] = ['matches', 'clubs', 'settings'];

export function tabForRoute(route: RouteId): AppTab {
  if (route === 'clubs') return 'clubs';
  if (route === 'settings') return 'settings';
  return 'matches';
}

export function tabHash(tab: AppTab): string {
  if (tab === 'clubs') return '#/klubovi';
  if (tab === 'settings') return '#/podesavanja';
  return '#/utakmice';
}

export function tabLabel(tab: AppTab): string {
  if (tab === 'matches') return 'Utakmice';
  if (tab === 'clubs') return 'Klubovi';
  return 'Podešavanja';
}

export function isMatchesRoute(route: RouteId): boolean {
  return tabForRoute(route) === 'matches';
}
