export class BodyTimeout extends Error {
  constructor() {
    super('body-timeout');
    this.name = 'BodyTimeout';
  }
}

/** Podrazumevano 5 s. Test sme da suzi rok, ali ne ispod 50 ms i ne preko 20 s. */
export function ioTimeoutMs(raw: string | undefined): number {
  const parsed = Number(raw ?? '5000');
  if (!Number.isFinite(parsed) || parsed < 50 || parsed > 20_000) return 5000;
  return parsed;
}

/**
 * Čita celo telo ili odustaje. Pozivalac mora da ograniči čekanje pre nego što
 * zahtev uđe u red Durable Object-a, inače jedan zaglavljen klijent drži sve klubove.
 */
export async function readBodyText(request: Request, timeoutMs: number, maxBytes: number): Promise<string> {
  const declared = Number(request.headers.get('content-length') ?? '');
  if (Number.isFinite(declared) && declared > maxBytes) return 'x'.repeat(maxBytes + 1);
  if (!request.body) return '';
  const reader = request.body.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = Date.now() + timeoutMs;
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        reader.cancel().catch(() => undefined);
        throw new BodyTimeout();
      }
      const pending = reader.read().then(
        (step) => ({ kind: 'read' as const, step }),
        () => ({ kind: 'closed' as const }),
      );
      const timeout = new Promise<{ kind: 'timeout' }>((resolve) => {
        timer = setTimeout(() => {
          reader.cancel().catch(() => undefined);
          resolve({ kind: 'timeout' });
        }, remaining);
      });
      const winner = await Promise.race([pending, timeout]);
      if (timer !== undefined) clearTimeout(timer);
      if (winner.kind === 'timeout') throw new BodyTimeout();
      if (winner.kind === 'closed' || winner.step.done) break;
      size += winner.step.value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return 'x'.repeat(maxBytes + 1);
      }
      chunks.push(winner.step.value);
    }
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
  const merged = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}
