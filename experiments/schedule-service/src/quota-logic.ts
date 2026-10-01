import { todayLocalDate } from './clock.ts';
import { sha256Utf8 } from './sha256.ts';

export interface QuotaLimits {
  userRequests: number;
  userFresh: number;
  ipRequests: number;
  ipFresh: number;
  ipAuthFailures: number;
  globalUpstream: number;
}

export const DEFAULT_QUOTA_LIMITS: QuotaLimits = {
  userRequests: 96,
  userFresh: 24,
  ipRequests: 192,
  ipFresh: 48,
  ipAuthFailures: 30,
  globalUpstream: 100,
};

export type QuotaDeny = 'quota_user' | 'quota_ip' | 'quota_global';

export interface QuotaGate {
  authBlocked(ip: string, now: Date): boolean;
  recordAuthFailure(ip: string, now: Date): void;
  tryConsume(input: {
    uid: string;
    ip: string;
    now: Date;
    fresh: boolean;
    upstream: number;
  }): { ok: true } | { ok: false; code: QuotaDeny };
}

interface Bucket {
  requests: number;
  fresh: number;
  authFailures?: number;
}

export interface QuotaFile {
  day: string;
  salt: string;
  users: Record<string, Bucket>;
  ips: Record<string, Bucket>;
  globalUpstream: number;
}

export function randomSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function quotaHash(salt: string, value: string): string {
  return sha256Utf8(`${salt}\0${value}`);
}

export function emptyQuota(day: string, salt: string): QuotaFile {
  return { day, salt, users: {}, ips: {}, globalUpstream: 0 };
}

/** Novi beogradski dan vraća brojače na nulu i zadržava so. Sirovi IP i uid se ne upisuju. */
export function loadQuota(existing: QuotaFile | null, now: Date): QuotaFile {
  const day = todayLocalDate(now);
  if (!existing || typeof existing.salt !== 'string' || existing.salt.length === 0) return emptyQuota(day, randomSalt());
  if (existing.day !== day) return emptyQuota(day, existing.salt);
  return existing;
}

export function quotaAuthBlocked(file: QuotaFile, limits: QuotaLimits, ip: string): boolean {
  const bucket = file.ips[quotaHash(file.salt, ip)];
  return (bucket?.authFailures ?? 0) >= limits.ipAuthFailures;
}

export function quotaRecordAuthFailure(file: QuotaFile, ip: string): void {
  const key = quotaHash(file.salt, ip);
  const bucket = file.ips[key] ?? { requests: 0, fresh: 0, authFailures: 0 };
  bucket.authFailures = (bucket.authFailures ?? 0) + 1;
  file.ips[key] = bucket;
}

export function quotaTryConsume(
  file: QuotaFile,
  limits: QuotaLimits,
  input: { uid: string; ip: string; fresh: boolean; upstream: number },
): { ok: true } | { ok: false; code: QuotaDeny } {
  const userKey = quotaHash(file.salt, `uid:${input.uid}`);
  const ipKey = quotaHash(file.salt, input.ip);
  const user = file.users[userKey] ?? { requests: 0, fresh: 0 };
  const ip = file.ips[ipKey] ?? { requests: 0, fresh: 0, authFailures: 0 };
  if (user.requests + 1 > limits.userRequests) return { ok: false, code: 'quota_user' };
  if (ip.requests + 1 > limits.ipRequests) return { ok: false, code: 'quota_ip' };
  if (input.fresh) {
    if (user.fresh + 1 > limits.userFresh) return { ok: false, code: 'quota_user' };
    if (ip.fresh + 1 > limits.ipFresh) return { ok: false, code: 'quota_ip' };
    if (file.globalUpstream + input.upstream > limits.globalUpstream) return { ok: false, code: 'quota_global' };
  }
  user.requests += 1;
  if (input.fresh) user.fresh += 1;
  ip.requests += 1;
  if (input.fresh) ip.fresh += 1;
  if (input.fresh) file.globalUpstream += input.upstream;
  file.users[userKey] = user;
  file.ips[ipKey] = ip;
  return { ok: true };
}

export function quotaLimitsFromJson(raw: string | undefined): QuotaLimits {
  if (!raw) return DEFAULT_QUOTA_LIMITS;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return DEFAULT_QUOTA_LIMITS;
  }
  if (typeof parsed !== 'object' || parsed === null) return DEFAULT_QUOTA_LIMITS;
  const record = parsed as Record<string, unknown>;
  const next = { ...DEFAULT_QUOTA_LIMITS };
  for (const key of Object.keys(DEFAULT_QUOTA_LIMITS) as (keyof QuotaLimits)[]) {
    const value = record[key];
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) return DEFAULT_QUOTA_LIMITS;
    next[key] = value;
  }
  return next;
}
