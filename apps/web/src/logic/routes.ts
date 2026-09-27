export type RouteId = 'home' | 'mine' | 'clubs' | 'settings';

/** Hash rute ne traže serverski fallback na GitHub Pages. */
export function parseRoute(hash: string): RouteId {
  const raw = hash.replace(/^#/, '').replace(/^\//, '').split(/[?#]/, 1)[0]?.replace(/\/$/, '') ?? '';
  if (raw === '' || raw === 'pocetna') return 'home';
  if (raw === 'moje') return 'mine';
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
  if (route === 'mine') return 'Moje';
  return routeTitle(route);
}

export function routeTitle(route: RouteId): string {
  if (route === 'home') return 'Početna';
  if (route === 'mine') return 'Moje utakmice';
  if (route === 'clubs') return 'Klubovi';
  return 'Podešavanja';
}
