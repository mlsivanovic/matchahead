import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import { MAX_BODY_BYTES, ScheduleService, type ScheduleDeps } from './service.ts';

export function createScheduleServer(deps: ScheduleDeps): Server {
  const service = new ScheduleService(deps);
  return createServer((request, response) => {
    void serve(service, deps, request, response);
  });
}

export function listen(server: Server, host = '127.0.0.1'): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, host, () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Server nema port.'));
        return;
      }
      resolve(address.port);
    });
  });
}

async function serve(
  service: ScheduleService,
  deps: ScheduleDeps,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  const declared = Number(request.headers['content-length'] ?? '0');
  const declaredTooLarge = Number.isFinite(declared) && declared > MAX_BODY_BYTES;
  const body = declaredTooLarge ? { tooLarge: true, text: '' } : await readBody(request, MAX_BODY_BYTES);
  const output = await service.handle({
    method: request.method ?? 'GET',
    path: url.pathname,
    origin: header(request.headers.origin),
    authorization: header(request.headers.authorization),
    queryKeys: [...url.searchParams.keys()],
    bodyText: body.tooLarge ? 'x'.repeat(MAX_BODY_BYTES + 1) : body.text,
    remoteAddress: clientAddress(request, deps.trustProxy === true),
  });
  write(response, output);
}

function write(
  response: ServerResponse,
  output: { status: number; headers: Record<string, string>; body: unknown },
): void {
  const payload = output.body === null ? '' : JSON.stringify(output.body);
  response.writeHead(output.status, { ...output.headers, 'content-length': Buffer.byteLength(payload) });
  response.end(payload);
}

async function readBody(request: IncomingMessage, max: number): Promise<{ tooLarge: boolean; text: string }> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > max) {
      request.resume();
      return { tooLarge: true, text: '' };
    }
    chunks.push(buffer);
  }
  return { tooLarge: false, text: Buffer.concat(chunks).toString('utf8') };
}

function clientAddress(request: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const headerValue = request.headers['x-forwarded-for'];
    const raw = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    const first = raw?.split(',')[0]?.trim();
    if (first) return first;
  }
  return request.socket.remoteAddress ?? 'unknown';
}

function header(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}
