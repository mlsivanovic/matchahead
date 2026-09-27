const MESSAGE_ID_PATTERN = /^synthetic-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isProbeMessageId(value: string): boolean {
  return MESSAGE_ID_PATTERN.test(value);
}

export function probeClickUrl(publicBase: string, probeMessageId: string): string {
  if (!isProbeMessageId(probeMessageId)) {
    throw new Error('invalid_probe_message_id');
  }
  const withSlash = publicBase.endsWith('/') ? publicBase : `${publicBase}/`;
  let base: URL;
  try {
    base = new URL(withSlash);
  } catch {
    throw new Error('invalid_public_base');
  }
  if (base.username || base.password || base.search || base.hash) {
    throw new Error('invalid_public_base');
  }
  const localhost = base.hostname === 'localhost' || base.hostname === '127.0.0.1';
  if (base.protocol !== 'https:' && !(base.protocol === 'http:' && localhost)) {
    throw new Error('invalid_public_base');
  }
  const click = new URL('poruka.html', base);
  if (click.origin !== base.origin) throw new Error('invalid_public_base');
  if (!click.pathname.endsWith('/poruka.html')) throw new Error('invalid_public_base');
  click.search = '';
  click.hash = '';
  click.searchParams.set('probe', 'synthetic');
  click.searchParams.set('id', probeMessageId);
  return click.toString();
}

export function clickPathOf(clickUrl: string): string {
  const url = new URL(clickUrl);
  return `${url.pathname}${url.search}`;
}
