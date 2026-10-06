import { appendFileSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { FindCacheRecord, ScheduleChange, SourceManifest } from '../../../packages/domain/src/index.ts';
import type { SchedulePersistence } from './persistence.ts';
import type { SharedSourcePage } from './source-share.ts';

const LOCK = '.lock';

export function withStoreLock<T>(dir: string, body: () => T): T {
  mkdirSync(dir, { recursive: true });
  const lock = join(dir, LOCK);
  const started = Date.now();
  for (;;) {
    try {
      mkdirSync(lock);
      break;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST') throw error;
      try {
        if (Date.now() - statSync(lock).mtimeMs > 10_000) {
          rmSync(lock, { recursive: true, force: true });
          continue;
        }
      } catch {
        continue;
      }
      if (Date.now() - started > 2_000) throw new Error('Keš je zauzet.');
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 15);
    }
  }
  try {
    return body();
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}

function readJson<T>(path: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
    throw error;
  }
}

function writeJson(path: string, value: unknown): void {
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(value));
  renameSync(temporary, path);
}

export class FileScheduleStore implements SchedulePersistence {
  directory: string;

  constructor(directory: string) {
    this.directory = directory;
    mkdirSync(join(directory, 'snapshots'), { recursive: true });
    mkdirSync(join(directory, 'sources'), { recursive: true });
  }

  get(key: string): FindCacheRecord | null {
    return withStoreLock(this.directory, () => {
      const found = readJson<FindCacheRecord | null>(this.snapshotPath(key), null);
      return found ? structuredClone(found) : null;
    });
  }

  set(key: string, record: FindCacheRecord): void {
    withStoreLock(this.directory, () => {
      writeJson(this.snapshotPath(key), record);
    });
  }

  readManifests(): SourceManifest[] {
    return withStoreLock(this.directory, () => readJson<SourceManifest[]>(join(this.directory, 'manifests.json'), []));
  }

  writeManifests(manifests: readonly SourceManifest[]): void {
    withStoreLock(this.directory, () => {
      writeJson(join(this.directory, 'manifests.json'), manifests);
    });
  }

  appendChanges(changes: readonly ScheduleChange[]): void {
    if (changes.length === 0) return;
    withStoreLock(this.directory, () => {
      const lines = changes.map((change) => JSON.stringify(change)).join('\n') + '\n';
      appendFileSync(join(this.directory, 'changes.jsonl'), lines);
    });
  }

  readChanges(): ScheduleChange[] {
    return withStoreLock(this.directory, () => {
      try {
        return readFileSync(join(this.directory, 'changes.jsonl'), 'utf8')
          .split('\n')
          .filter((line) => line.length > 0)
          .map((line) => JSON.parse(line) as ScheduleChange);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
        throw error;
      }
    });
  }

  readPolicy(key: string): string | null {
    return withStoreLock(this.directory, () => {
      const all = readJson<Record<string, string>>(join(this.directory, 'policy.json'), {});
      return all[key] ?? null;
    });
  }

  writePolicy(key: string, fingerprint: string): void {
    withStoreLock(this.directory, () => {
      const path = join(this.directory, 'policy.json');
      const all = readJson<Record<string, string>>(path, {});
      all[key] = fingerprint;
      writeJson(path, all);
    });
  }

  readSource(key: string): SharedSourcePage | null {
    return withStoreLock(this.directory, () => {
      const found = readJson<SharedSourcePage | null>(this.sourcePath(key), null);
      return found ? structuredClone(found) : null;
    });
  }

  writeSource(page: SharedSourcePage): void {
    withStoreLock(this.directory, () => {
      writeJson(this.sourcePath(page.key), page);
    });
  }

  listSources(): SharedSourcePage[] {
    return withStoreLock(this.directory, () => this.readSourceFiles());
  }

  deleteSources(match: { competitionId: string; seasonId: string; provider: string }): void {
    withStoreLock(this.directory, () => {
      for (const found of this.readSourceFiles()) {
        if (
          found.competitionId !== match.competitionId ||
          found.seasonId !== match.seasonId ||
          found.provider !== match.provider
        ) {
          continue;
        }
        rmSync(this.sourcePath(found.key), { force: true });
      }
    });
  }

  readSourceFiles(): SharedSourcePage[] {
    let names: string[] = [];
    try {
      names = readdirSync(join(this.directory, 'sources'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
    const pages: SharedSourcePage[] = [];
    for (const name of names) {
      if (!name.endsWith('.json') || name.includes('.tmp')) continue;
      const found = readJson<SharedSourcePage | null>(join(this.directory, 'sources', name), null);
      if (found) pages.push(structuredClone(found));
    }
    return pages;
  }

  snapshotPath(key: string): string {
    return join(this.directory, 'snapshots', `${encodeURIComponent(key)}.json`);
  }

  sourcePath(key: string): string {
    return join(this.directory, 'sources', `${encodeURIComponent(key)}.json`);
  }
}
