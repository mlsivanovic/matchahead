import { appendFileSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { FindCacheRecord, ScheduleChange, SourceManifest } from '../../../packages/domain/src/index.ts';
import type { SchedulePersistence } from './persistence.ts';

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

  snapshotPath(key: string): string {
    return join(this.directory, 'snapshots', `${encodeURIComponent(key)}.json`);
  }
}
