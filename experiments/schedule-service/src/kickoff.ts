import { isRealCalendarDate } from '../../../packages/domain/src/index.ts';

export interface WallParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function wallParts(instant: Date, timeZone: string): WallParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const pick = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return {
    year: pick('year'),
    month: pick('month'),
    day: pick('day'),
    hour: pick('hour'),
    minute: pick('minute'),
    second: pick('second'),
  };
}

/** Zidno vreme u zadatoj zoni pretvara u UTC. Neuspeo dan (prelazak) vraća null. */
export function zonedWallTimeToUtc(date: string, time: string, timeZone: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const clock = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(time);
  if (!match || !clock || !isRealCalendarDate(date)) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(clock[1]);
  const minute = Number(clock[2]);
  const second = Number(clock[3] ?? '0');
  if (hour > 23 || minute > 59 || second > 59) return null;
  const desired = Date.UTC(year, month - 1, day, hour, minute, second);
  let utc = desired;
  for (let pass = 0; pass < 2; pass += 1) {
    const seen = wallParts(new Date(utc), timeZone);
    const seenUtc = Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute, seen.second);
    utc += desired - seenUtc;
  }
  const check = wallParts(new Date(utc), timeZone);
  if (
    check.year !== year ||
    check.month !== month ||
    check.day !== day ||
    check.hour !== hour ||
    check.minute !== minute ||
    check.second !== second
  ) {
    return null;
  }
  return new Date(utc).toISOString().replace('.000Z', 'Z');
}

export function clockMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

/**
 * CET natpis na ABA strani postaje Beograd tek uz dokaz: neki red ima
 * Cluj-Napoca tačno sat kasnije, a odštampani satovi nisu svi isti.
 */
export function abaPageConfirmsBelgrade(rows: readonly { clock: string | null; cluj: string | null }[]): boolean {
  const clocks = new Set(rows.map((row) => row.clock).filter((clock): clock is string => clock !== null));
  if (clocks.size < 2) return false;
  return rows.some((row) => {
    if (!row.clock || !row.cluj) return false;
    const left = clockMinutes(row.clock);
    const right = clockMinutes(row.cluj);
    if (left === null || right === null) return false;
    return (right - left + 24 * 60) % (24 * 60) === 60;
  });
}
