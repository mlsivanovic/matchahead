export function decodeHtml(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, digits: string) => String.fromCodePoint(Number(digits)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

export function visibleText(value: string): string {
  return decodeHtml(value.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

export function dottedDate(value: string): { date: string; clock: string | null } | null {
  const match = /(\d{1,2})\.(\d{1,2})\.(\d{4})\.?(?:\s+(\d{2}:\d{2}))?/.exec(value);
  if (!match) return null;
  const day = match[1]!.padStart(2, '0');
  const month = match[2]!.padStart(2, '0');
  return { date: `${match[3]}-${month}-${day}`, clock: match[4] ?? null };
}

export function isoDateTime(value: string): { date: string; clock: string | null } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}:\d{2})(?::\d{2})?)?/.exec(value.trim());
  if (!match) return null;
  if (match[1] === '0000') return null;
  return { date: `${match[1]}-${match[2]}-${match[3]}`, clock: match[4] ?? null };
}
