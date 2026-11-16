import type { Demand, Distance, Lodging, Participation, PlanInput, Shift, TransportKind } from './types';
import { addDays, addMinutes, ms } from './time';

/** Distance lookup; falls back to the reverse direction if only that one is maintained. */
export function makeDistanceLookup(distances: Distance[]) {
  const map = new Map<string, number>();
  for (const d of distances) map.set(`${d.fromId}|${d.toId}|${d.kind}`, d.minutes);
  return (fromId: string, toId: string, kind: TransportKind): number | undefined => {
    if (fromId === toId) return 0;
    return map.get(`${fromId}|${toId}|${kind}`) ?? map.get(`${toId}|${fromId}|${kind}`);
  };
}

export function makeLodgingLookup(lodgings: Lodging[], participations: Participation[]) {
  const explicit = new Map<string, string>();
  for (const l of lodgings) explicit.set(`${l.personId}|${l.night}`, l.locationId);
  const fallback = new Map<string, string | null | undefined>();
  for (const p of participations) fallback.set(p.personId, p.defaultLodgingId);
  return (personId: string, night: string): string | null =>
    explicit.get(`${personId}|${night}`) ?? fallback.get(personId) ?? null;
}

/**
 * Derives every transport demand from participations, shifts and lodgings:
 * arrival, morning (lodging → first shift), transfers between shift locations,
 * evening (last shift → lodging) and departure. Coverage status comes from
 * trip passengers (by demandKey) and dispatcher overrides.
 */
export function deriveDemands(input: PlanInput): Demand[] {
  const { event, participations, shifts, trips, overrides, locations } = input;
  const dist = makeDistanceLookup(input.distances);
  const lodgingOf = makeLodgingLookup(input.lodgings, participations);
  const bufferOf = new Map(locations.map((l) => [l.id, l.bufferMin ?? event.defaultBufferMin]));
  const buffer = (locId: string) => bufferOf.get(locId) ?? event.defaultBufferMin;

  const shiftsByPerson = new Map<string, Shift[]>();
  for (const s of shifts) {
    const list = shiftsByPerson.get(s.personId) ?? [];
    list.push(s);
    shiftsByPerson.set(s.personId, list);
  }

  const covered = new Map<string, string>();
  for (const t of trips) {
    if (t.status === 'CANCELLED') continue;
    for (const p of t.passengers) if (p.demandKey) covered.set(p.demandKey, t.id);
  }
  const overrideOf = new Map(overrides.map((o) => [o.demandKey, o]));

  const demands: Demand[] = [];

  for (const part of participations) {
    const list = (shiftsByPerson.get(part.personId) ?? []).sort((a, b) => ms(a.start) - ms(b.start));
    if (list.length === 0) continue;

    const push = (d: Omit<Demand, 'status' | 'prio' | 'personId'>) => {
      if (d.fromId && d.toId && d.fromId === d.toId) return;
      demands.push({ ...d, personId: part.personId, prio: part.prio, status: 'OPEN' });
    };

    const days = [...new Set(list.map((s) => s.date))].sort();
    const firstDay = days[0]!;
    const lastDay = days[days.length - 1]!;

    for (const day of days) {
      const dayShifts = list.filter((s) => s.date === day);
      const first = dayShifts[0]!;
      const last = dayShifts[dayShifts.length - 1]!;
      const deadline = addMinutes(first.start, -buffer(first.locationId));

      if (day === firstDay) {
        push({
          key: `${part.personId}:ARRIVAL`,
          kind: 'ARRIVAL',
          date: day,
          fromId: part.startLocationId ?? null,
          toId: first.locationId,
          earliestDeparture: part.earliestDeparture ?? null,
          latestArrival: deadline,
        });
      } else {
        push({
          key: `${part.personId}:MORNING:${day}`,
          kind: 'MORNING',
          date: day,
          fromId: lodgingOf(part.personId, addDays(day, -1)),
          toId: first.locationId,
          earliestDeparture: null,
          latestArrival: deadline,
        });
      }

      for (let i = 1; i < dayShifts.length; i++) {
        const prev = dayShifts[i - 1]!;
        const next = dayShifts[i]!;
        if (prev.locationId === next.locationId) continue;
        push({
          key: `${part.personId}:TRANSFER:${prev.id}`,
          kind: 'TRANSFER',
          date: day,
          fromId: prev.locationId,
          toId: next.locationId,
          earliestDeparture: prev.end,
          latestArrival: addMinutes(next.start, -buffer(next.locationId)),
        });
      }

      if (day === lastDay) {
        push({
          key: `${part.personId}:DEPARTURE`,
          kind: 'DEPARTURE',
          date: day,
          fromId: last.locationId,
          toId: part.endLocationId ?? null,
          earliestDeparture: last.end,
          latestArrival: part.latestArrival ?? null,
        });
      } else {
        push({
          key: `${part.personId}:EVENING:${day}`,
          kind: 'EVENING',
          date: day,
          fromId: last.locationId,
          toId: lodgingOf(part.personId, day),
          earliestDeparture: last.end,
          latestArrival: null,
        });
      }
    }
  }

  for (const d of demands) {
    const tripId = covered.get(d.key);
    const override = overrideOf.get(d.key);
    if (!d.fromId || !d.toId) d.status = 'INVALID';
    else if (tripId) {
      d.status = 'COVERED';
      d.tripId = tripId;
    } else if (override) {
      d.status = override.kind === 'WALK' ? 'WALK' : 'ALTERNATIVE';
      d.note = override.note ?? undefined;
    } else {
      const walk = dist(d.fromId, d.toId, 'WALK');
      if (walk !== undefined && walk <= event.walkThresholdMin) d.status = 'WALK';
    }
  }

  return demands.sort(
    (a, b) =>
      (a.latestArrival ?? a.earliestDeparture ?? '').localeCompare(b.latestArrival ?? b.earliestDeparture ?? '') ||
      a.prio - b.prio,
  );
}
