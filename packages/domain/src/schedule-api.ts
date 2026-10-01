import { isSelectableTeamId } from './selectable-teams.ts';
import type { FindFixturesResult } from './find-fixtures.ts';
import type { Competition, SourceManifest, Sport, Team } from './types.ts';

/**
 * HTTP ugovor `POST /api/find-fixtures` za fazu 05.
 * Server sam računa trenutak i lokalni datum. Klijent ne šalje vreme.
 * `checkedAt` unutar `result` je trenutak poslednjeg snimka koji je objavio
 * bar jedan dozvoljen feed, ili null. Nije vreme poslednjeg pokušaja.
 * Pokušaj, uspeh jednog izvora i promena sadržaja žive u `manifests`.
 */

export const FIND_FIXTURES_HTTP_PATH = '/api/find-fixtures';

/** Jedina sezona koju ovaj ugovor trenutno prihvata. */
export const INITIAL_SEASON_ID = '2026-2027';

export type FindFixturesResponseKind = 'verified-schedule' | 'source-blocked' | 'synthetic-demo';

export type ScheduleChangeKind = 'new' | 'rescheduled' | 'postponed' | 'cancelled';

export interface ScheduleChange {
  fixtureId: string;
  revision: number;
  kind: ScheduleChangeKind;
}

export interface FindFixturesHttpRequest {
  sport: Sport;
  teamId: string;
  seasonId: string;
  refresh: boolean;
}

export interface FindFixturesHttpSuccess {
  kind: FindFixturesResponseKind;
  result: FindFixturesResult;
  teams: Team[];
  competitions: Competition[];
  manifests: SourceManifest[];
  changes: ScheduleChange[];
}

export type FindFixturesHttpErrorCode =
  | 'invalid_json'
  | 'invalid_body'
  | 'invalid_sport'
  | 'invalid_team'
  | 'invalid_season'
  | 'unauthorized'
  | 'forbidden_origin'
  | 'method_not_allowed'
  | 'not_found'
  | 'quota_user'
  | 'quota_ip'
  | 'quota_global'
  | 'payload_too_large';

export interface FindFixturesHttpError {
  error: {
    code: FindFixturesHttpErrorCode;
    message: string;
  };
}

const REQUEST_KEYS = new Set(['sport', 'teamId', 'seasonId', 'refresh']);

export function findFixturesHttpStatus(code: FindFixturesHttpErrorCode): number {
  switch (code) {
    case 'invalid_json':
    case 'invalid_body':
    case 'invalid_sport':
    case 'invalid_team':
    case 'invalid_season':
    case 'payload_too_large':
      return 400;
    case 'unauthorized':
      return 401;
    case 'forbidden_origin':
      return 403;
    case 'not_found':
      return 404;
    case 'method_not_allowed':
      return 405;
    case 'quota_user':
    case 'quota_ip':
    case 'quota_global':
      return 429;
    default: {
      const unreachable: never = code;
      return unreachable;
    }
  }
}

export function readFindFixturesHttpRequest(
  value: unknown,
): { ok: true; request: FindFixturesHttpRequest } | { ok: false; error: FindFixturesHttpError['error'] } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, error: { code: 'invalid_body', message: 'Telo mora biti JSON objekat.' } };
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!REQUEST_KEYS.has(key)) {
      return {
        ok: false,
        error: {
          code: 'invalid_body',
          message: 'Zahtev ima polje koje server ne prihvata. Vreme računa server.',
        },
      };
    }
  }
  if (record.sport !== 'football' && record.sport !== 'basketball') {
    return { ok: false, error: { code: 'invalid_sport', message: 'Sport mora biti football ili basketball.' } };
  }
  if (typeof record.teamId !== 'string' || !isSelectableTeamId(record.teamId, record.sport)) {
    return { ok: false, error: { code: 'invalid_team', message: 'Tim nije među četiri dozvoljena izbora.' } };
  }
  if (record.seasonId !== INITIAL_SEASON_ID) {
    return { ok: false, error: { code: 'invalid_season', message: 'Sezona za ovu verziju je 2026-2027.' } };
  }
  if (typeof record.refresh !== 'boolean') {
    return { ok: false, error: { code: 'invalid_body', message: 'Polje refresh mora biti boolean.' } };
  }
  return {
    ok: true,
    request: {
      sport: record.sport,
      teamId: record.teamId,
      seasonId: record.seasonId,
      refresh: record.refresh,
    },
  };
}
