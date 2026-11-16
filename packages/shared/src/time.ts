export const MIN = 60_000;
export const HOUR = 60 * MIN;

export const ms = (iso: string): number => Date.parse(iso);
export const iso = (t: number): string => new Date(t).toISOString();
export const addMinutes = (isoStr: string, minutes: number): string => iso(ms(isoStr) + minutes * MIN);

/** Add days to a 'YYYY-MM-DD' date string. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Inclusive list of dates between two 'YYYY-MM-DD' strings. */
export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number): boolean =>
  aStart < bEnd && bStart < aEnd;

/** Offset (ms) of a time zone at a given instant: local wall time − UTC. */
function tzOffsetMs(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(instant));
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')) - instant;
}

/** Converts a wall-clock date + 'HH:mm' in a time zone to an ISO UTC timestamp (DST-aware). */
export function zonedToIso(date: string, hhmm: string, timeZone: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const [h, mi] = hhmm.split(':').map(Number) as [number, number];
  const guess = Date.UTC(y, m - 1, d, h, mi);
  let t = guess - tzOffsetMs(guess, timeZone);
  t = guess - tzOffsetMs(t, timeZone);
  return new Date(t).toISOString();
}
