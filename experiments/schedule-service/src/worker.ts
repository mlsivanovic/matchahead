import { BodyTimeout, ioTimeoutMs, readBodyText } from './read-body.ts';
import { SCHEDULE_OBJECT_NAME, ScheduleDirectoryObject, type ScheduleEnv } from './schedule-object.ts';
import { MAX_BODY_BYTES, ingressDecision, type OutgoingResponse } from './service.ts';

export { ScheduleDirectoryObject };

export default {
  async fetch(request: Request, env: ScheduleEnv): Promise<Response> {
    const url = new URL(request.url);
    const origins = (env.SCHEDULE_ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    const decision = ingressDecision({
      method: request.method,
      path: url.pathname,
      origin: request.headers.get('origin'),
      queryKeys: [...url.searchParams.keys()],
      origins,
    });
    if (decision) {
      logDecision(decision);
      return toResponse(decision);
    }
    const origin = request.headers.get('origin');
    const cors = origin !== null && origins.includes(origin)
      ? {
          'access-control-allow-origin': origin,
          'access-control-allow-methods': 'POST, OPTIONS',
          'access-control-allow-headers': 'Authorization, Content-Type',
          vary: 'Origin',
        }
      : {};
    let bodyText: string;
    try {
      bodyText = await readBodyText(request, ioTimeoutMs(env.SCHEDULE_IO_TIMEOUT_MS), MAX_BODY_BYTES);
    } catch (error) {
      if (error instanceof BodyTimeout) {
        const timedOut: OutgoingResponse = {
          status: 400,
          body: { error: { code: 'payload_too_large', message: 'Telo nije stiglo u roku.' } },
          headers: {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store',
            'x-content-type-options': 'nosniff',
            ...cors,
          },
        };
        logDecision(timedOut);
        return toResponse(timedOut);
      }
      return jsonResponse(500, { error: { code: 'not_found', message: 'Zahtev nije obrađen.' } });
    }
    const forwarded = new Request(request.url, {
      method: 'POST',
      headers: request.headers,
      body: bodyText,
    });
    const id = env.SCHEDULE.idFromName(SCHEDULE_OBJECT_NAME);
    return env.SCHEDULE.get(id).fetch(forwarded);
  },
};

function logDecision(output: OutgoingResponse): void {
  const code = output.body && 'error' in output.body ? output.body.error.code : null;
  console.log(JSON.stringify({ status: output.status, code, teamId: null }));
}

function toResponse(output: OutgoingResponse): Response {
  const payload = output.body === null ? '' : JSON.stringify(output.body);
  return new Response(payload, { status: output.status, headers: output.headers });
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}
