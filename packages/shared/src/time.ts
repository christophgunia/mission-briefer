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
