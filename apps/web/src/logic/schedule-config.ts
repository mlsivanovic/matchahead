import { normalizeApiBaseUrl } from './schedule-api.ts';

/**
 * Faza 05: javna adresa serverskog sloja. Jedina nova VITE vrednost je
 * običan URL — nikakav API ključ, tajna ni token ne ulazi u Vite config.
 * Prazna/neispravna vrednost znači pošteno onemogućeno stanje, ne tišinu.
 * Uputstvo za podešavanje živi u docs/handoffs/05-client.md, ne u interfejsu.
 */

export type ScheduleServerConfig =
  | { kind: 'ready'; baseUrl: string }
  | { kind: 'unconfigured' };

export interface ScheduleServerEnv {
  VITE_SCHEDULE_API_URL?: string;
}

export function readScheduleServerConfig(env: ScheduleServerEnv): ScheduleServerConfig {
  const baseUrl = normalizeApiBaseUrl(env.VITE_SCHEDULE_API_URL);
  if (!baseUrl) return { kind: 'unconfigured' };
  return { kind: 'ready', baseUrl };
}

/** Poruka za interfejs: prost srpski, bez imena promenljivih i detalja builda. */
export function scheduleServerDisabledMessage(): string {
  return 'Server rasporeda nije podešen u ovoj instalaciji. '
    + 'Pronalaženje nije dostupno; prikaz je iz sačuvanog stanja i DEMO rasporeda.';
}
