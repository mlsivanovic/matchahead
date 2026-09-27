/** Sintetički oblik za merenje parsiranja. Nije korisnički dokument i nije stvarni raspored. */

export function firestoreProbeUrl(projectId: string): string {
  if (!/^[a-z0-9-]{6,30}$/.test(projectId)) throw new Error('invalid_project_id');
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/probeCpu/sample`;
}

export const SAMPLE_FIRESTORE_DOCUMENT = {
  name: 'projects/matchahead-probe/databases/(default)/documents/probeCpu/sample',
  fields: {
    kind: { stringValue: 'synthetic-probe' },
    fid: { stringValue: 'c'.padEnd(22, 'A') },
    note: { stringValue: 'Sintetički dokument za merenje parsiranja. Nije utakmica.' },
  },
  createTime: '2026-09-27T00:00:00Z',
  updateTime: '2026-09-27T00:00:00Z',
};

export function parseFirestoreProbeDocument(body: unknown): { ok: true; kind: string } | { ok: false } {
  if (body === null || typeof body !== 'object') return { ok: false };
  const fields = (body as { fields?: unknown }).fields;
  if (fields === null || typeof fields !== 'object') return { ok: false };
  const kind = (fields as { kind?: { stringValue?: unknown } }).kind?.stringValue;
  if (kind !== 'synthetic-probe') return { ok: false };
  return { ok: true, kind };
}

export function timeFirestoreParse(sample: unknown = SAMPLE_FIRESTORE_DOCUMENT): { parseMs: number; ok: boolean } {
  const serialized = JSON.stringify(sample);
  const started = performance.now();
  const parsed = parseFirestoreProbeDocument(JSON.parse(serialized));
  return { parseMs: performance.now() - started, ok: parsed.ok };
}
