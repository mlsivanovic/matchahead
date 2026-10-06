import type { FindCacheRecord, FindCacheStore, ScheduleChange, SourceManifest } from '../../../packages/domain/src/index.ts';
import type { SharedSourcePage } from './source-share.ts';

/** Trajno stanje rasporeda. Datoteka i SQLite Durable Object imaju iste metode. */
export interface SchedulePersistence extends FindCacheStore {
  readManifests(): SourceManifest[];
  writeManifests(manifests: readonly SourceManifest[]): void;
  appendChanges(changes: readonly ScheduleChange[]): void;
  readChanges(): ScheduleChange[];
  readPolicy(key: string): string | null;
  writePolicy(key: string, fingerprint: string): void;
  readSource(key: string): SharedSourcePage | null;
  writeSource(page: SharedSourcePage): void;
  listSources(): SharedSourcePage[];
  deleteSources(match: { competitionId: string; seasonId: string; provider: string }): void;
}

export type { FindCacheRecord };
