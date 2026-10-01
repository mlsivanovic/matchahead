import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  DEFAULT_QUOTA_LIMITS,
  loadQuota,
  quotaAuthBlocked,
  quotaRecordAuthFailure,
  quotaTryConsume,
  type QuotaDeny,
  type QuotaFile,
  type QuotaGate,
  type QuotaLimits,
} from './quota-logic.ts';
import { withStoreLock } from './store.ts';

export { DEFAULT_QUOTA_LIMITS };
export type { QuotaDeny, QuotaGate, QuotaLimits };

export class QuotaBook implements QuotaGate {
  directory: string;
  limits: QuotaLimits;

  constructor(directory: string, limits: QuotaLimits) {
    this.directory = directory;
    this.limits = limits;
    mkdirSync(directory, { recursive: true });
  }

  /** 429 pre provere tokena kada je IP već potrošio neuspele prijave. Ne povećava brojač. */
  authBlocked(ip: string, now: Date): boolean {
    return withStoreLock(this.directory, () => quotaAuthBlocked(this.read(now), this.limits, ip));
  }

  recordAuthFailure(ip: string, now: Date): void {
    withStoreLock(this.directory, () => {
      const file = this.read(now);
      quotaRecordAuthFailure(file, ip);
      this.write(file);
    });
  }

  /**
   * Sve provere pre bilo kog povećanja. Keš pogodak ne troši svež ni globalni plafon.
   * U datoteci su samo heševi, ne sirovi IP ni uid.
   */
  tryConsume(input: {
    uid: string;
    ip: string;
    now: Date;
    fresh: boolean;
    upstream: number;
  }): { ok: true } | { ok: false; code: QuotaDeny } {
    return withStoreLock(this.directory, () => {
      const file = this.read(input.now);
      const result = quotaTryConsume(file, this.limits, input);
      if (result.ok) this.write(file);
      return result;
    });
  }

  snapshot(now: Date): QuotaFile {
    return withStoreLock(this.directory, () => structuredClone(this.read(now)));
  }

  read(now: Date): QuotaFile {
    const path = join(this.directory, 'quota.json');
    try {
      return loadQuota(JSON.parse(readFileSync(path, 'utf8')) as QuotaFile, now);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return loadQuota(null, now);
      throw error;
    }
  }

  write(file: QuotaFile): void {
    const path = join(this.directory, 'quota.json');
    const temporary = `${path}.${process.pid}.tmp`;
    writeFileSync(temporary, JSON.stringify(file));
    renameSync(temporary, path);
  }
}
