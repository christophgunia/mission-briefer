import dayjs from 'dayjs';
import type { TFunction } from 'i18next';
import type { Conflict, Demand } from '@mb/shared';
import type { Plan } from './api';

export const fmtTime = (iso?: string | null) => (iso ? dayjs(iso).format('HH:mm') : '–');
export const fmtDay = (date: string, lng = 'de') =>
  new Date(`${date}T12:00:00`).toLocaleDateString(lng, { weekday: 'short', day: '2-digit', month: '2-digit' });
/** Local 'YYYY-MM-DD' of an ISO timestamp. */
export const localDate = (iso: string) => dayjs(iso).format('YYYY-MM-DD');
/** ISO from local date + 'HH:mm'. */
export const localIso = (date: string, hhmm: string) => dayjs(`${date}T${hhmm}`).toISOString();

export function lookups(plan?: Plan) {
  const loc = new Map(plan?.locations.map((l) => [l.id, l]) ?? []);
  const person = new Map(plan?.persons.map((p) => [p.id, p]) ?? []);
  const vehicle = new Map(plan?.vehicles.map((v) => [v.id, v]) ?? []);
  return {
    loc: (id?: string | null) => (id ? (loc.get(id)?.name ?? '?') : '–'),
    person: (id?: string | null) => (id ? (person.get(id)?.name ?? '?') : '–'),
    vehicle: (id?: string | null) => (id ? (vehicle.get(id)?.name ?? '?') : '–'),
    vehicleObj: (id: string) => vehicle.get(id),
    personObj: (id: string) => person.get(id),
  };
}

export type Lookups = ReturnType<typeof lookups>;

export function conflictText(c: Conflict, t: TFunction, l: Lookups, demands?: Map<string, Demand>): string {
  const d = c.demandKey ? demands?.get(c.demandKey) : undefined;
  return t(`conflicts.codes.${c.code}`, {
    ...c.params,
    person: l.person(c.personId),
    vehicle: l.vehicle(c.vehicleId),
    kind: d ? t(`demand.kinds.${d.kind}`) : (c.params?.kind ? t(`demand.kinds.${c.params.kind}`) : ''),
  });
}

export const severityColor = { ERROR: 'red', WARNING: 'orange', INFO: 'gray' } as const;
export const prioColor = (p: number) => (p <= 1 ? 'red' : p <= 2 ? 'orange' : p <= 4 ? 'yellow' : 'gray');
