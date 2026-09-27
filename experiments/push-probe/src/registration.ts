import { isSelectableTeamId } from '../../../packages/domain/src/selectable-teams.ts';
import { classifyInstallationId } from './ids.ts';

const OPPONENT_MAX = 80;
const ALLOWED_KEYS = new Set(['fid', 'followedTeamId', 'opponentLabel']);

export interface RegistrationInput {
  fid: string;
  followedTeamId: string | null;
  opponentLabel: string | null;
}

export interface RegistrationParseFailure {
  ok: false;
  status: number;
  error: string;
}

export function parseRegistrationBody(body: unknown): { ok: true; value: RegistrationInput } | RegistrationParseFailure {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, status: 400, error: 'invalid_body' };
  }
  const record = body as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!ALLOWED_KEYS.has(key)) {
      return { ok: false, status: 400, error: key === 'token' || key === 'registrationToken' || key === 'fcmToken' ? 'legacy_token_rejected' : 'unexpected_field' };
    }
  }
  const installation = classifyInstallationId(record.fid);
  if (installation === 'legacy_token') return { ok: false, status: 400, error: 'legacy_token_rejected' };
  if (installation !== 'fid') return { ok: false, status: 400, error: 'invalid_fid' };

  let followedTeamId: string | null = null;
  if (record.followedTeamId !== undefined && record.followedTeamId !== null) {
    if (typeof record.followedTeamId !== 'string' || !isSelectableTeamId(record.followedTeamId)) {
      return { ok: false, status: 400, error: 'team_not_selectable' };
    }
    followedTeamId = record.followedTeamId;
  }

  let opponentLabel: string | null = null;
  if (record.opponentLabel !== undefined && record.opponentLabel !== null) {
    if (typeof record.opponentLabel !== 'string') {
      return { ok: false, status: 400, error: 'invalid_opponent' };
    }
    const trimmed = record.opponentLabel.trim();
    if (trimmed.length < 1 || trimmed.length > OPPONENT_MAX || /[\r\n\u0000]/.test(trimmed)) {
      return { ok: false, status: 400, error: 'invalid_opponent' };
    }
    opponentLabel = trimmed;
  }

  return {
    ok: true,
    value: {
      fid: record.fid as string,
      followedTeamId,
      opponentLabel,
    },
  };
}
