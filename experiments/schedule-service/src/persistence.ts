import type { FindCacheRecord, FindCacheStore, ScheduleChange, SourceManifest } from '../../../packages/domain/src/index.ts';

/** Trajno stanje rasporeda. Datoteka i SQLite Durable Object imaju iste metode. */
export interface SchedulePersistence extends FindCacheStore {
  readManifests(): SourceManifest[];
  writeManifests(manifests: readonly SourceManifest[]): void;
  appendChanges(changes: readonly ScheduleChange[]): void;
  readChanges(): ScheduleChange[];
  readPolicy(key: string): string | null;
  writePolicy(key: string, fingerprint: string): void;
}

export type { FindCacheRecord };
