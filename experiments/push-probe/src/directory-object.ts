import { handleDirectoryRequest, sessionFrom } from './directory.ts';

interface DirectorySql {
  exec(query: string, ...bindings: Array<string | number | null>): Iterable<Record<string, string | number | null | ArrayBuffer>>;
}

/**
 * Jedan zahtev se završi pre sledećeg. `await request.json()` inače otvara
 * ulaznu kapiju Durable Object-a pre SQL upisa, pa bi se brojači preklapali.
 */
export class ProbeDirectoryObject {
  #sql: ReturnType<typeof sessionFrom>;
  #tail: Promise<void> = Promise.resolve();

  constructor(state: { storage: { sql: DirectorySql } }) {
    this.#sql = sessionFrom(state.storage.sql);
  }

  fetch(request: Request): Promise<Response> {
    const run = this.#tail.then(() => handleDirectoryRequest(this.#sql, request));
    this.#tail = run.then(() => undefined, () => undefined);
    return run;
  }
}
