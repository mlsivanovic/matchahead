export interface DailyQuotaInput {
  refreshesPerDay: number;
  requestsPerRefresh: number;
  catalogRequestsPerDay: number;
  retryReserveRequests: number;
}

/** broj osvežavanja × zahtevi po osvežavanju + katalog + rezerva za ponavljanje. */
export function dailyRequestCount(input: DailyQuotaInput): number {
  for (const [label, value] of Object.entries(input)) {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`${label} mora biti nenegativan ceo broj.`);
    }
  }
  return (
    input.refreshesPerDay * input.requestsPerRefresh +
    input.catalogRequestsPerDay +
    input.retryReserveRequests
  );
}

export function fitsDailyQuota(used: number, limit: number): boolean {
  if (!Number.isInteger(limit) || limit < 0) {
    throw new Error('Kvota mora biti nenegativan ceo broj.');
  }
  return used <= limit;
}

function assertWhole(label: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} mora biti nenegativan ceo broj.`);
  }
}

/** Zbir strana jednog svežeg „Pronađi”. Svaka strana je jedan zahtev. */
export function requestsForFreshFind(pagesPerCompetition: readonly number[]): number {
  let total = 0;
  for (const pages of pagesPerCompetition) {
    if (!Number.isInteger(pages) || pages < 1) {
      throw new Error('Broj strana takmičenja mora biti pozitivan ceo broj. Nepoznata paginacija nema zbir.');
    }
    total += pages;
  }
  return total;
}

/**
 * Keš pogodak ne zove izvor. Broj korisnika ulazi samo kroz promašaje keša.
 */
export function upstreamRequestsForClicks(input: {
  clicks: number;
  clicksServedFromCache: number;
  requestsPerFreshFind: number;
}): number {
  assertWhole('clicks', input.clicks);
  assertWhole('clicksServedFromCache', input.clicksServedFromCache);
  assertWhole('requestsPerFreshFind', input.requestsPerFreshFind);
  if (input.clicksServedFromCache > input.clicks) {
    throw new Error('Keš pogodaka ne može biti više od klikova.');
  }
  return (input.clicks - input.clicksServedFromCache) * input.requestsPerFreshFind;
}

/** Koliko svežih osvežavanja jednog ključa staje u jedan dan pri razmaku u minutima. */
export function maxFreshFindsPerDay(minRefreshMinutes: number): number {
  if (!Number.isInteger(minRefreshMinutes) || minRefreshMinutes < 1) {
    throw new Error('Razmak osvežavanja mora biti pozitivan ceo broj minuta.');
  }
  return Math.floor((24 * 60) / minRefreshMinutes);
}

/**
 * Donja granica trajanja ako se zahtevi moraju razmaknuti, bez merenja mreže.
 * Nula zahteva traje 0. Inače (n − 1) razmaka.
 */
export function minSpacingSeconds(requests: number, gapSeconds: number): number {
  assertWhole('requests', requests);
  if (!Number.isInteger(gapSeconds) || gapSeconds < 0) {
    throw new Error('Razmak mora biti nenegativan ceo broj sekundi.');
  }
  if (requests === 0) return 0;
  return (requests - 1) * gapSeconds;
}
