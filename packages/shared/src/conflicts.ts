import type { Conflict, Demand, PlanInput, Trip } from './types';
import { makeDistanceLookup } from './demands';
import { HOUR, MIN, ms, overlaps } from './time';

/** Start/end of a trip: first departure → last arrival (falls back to the other time of the stop). */
export function tripSpan(trip: Trip): { start: number; end: number } | null {
  const stops = [...trip.stops].sort((a, b) => a.order - b.order);
  if (stops.length === 0) return null;
  const f = stops[0]!;
  const l = stops[stops.length - 1]!;
  const s = f.departure ?? f.arrival;
  const e = l.arrival ?? l.departure;
  if (!s || !e) return null;
  return { start: ms(s), end: ms(e) };
}

const stopTime = (s: { arrival?: string | null; departure?: string | null }, which: 'arr' | 'dep') =>
  which === 'arr' ? (s.arrival ?? s.departure ?? null) : (s.departure ?? s.arrival ?? null);

export function checkConflicts(input: PlanInput, demands: Demand[]): Conflict[] {
  const out: Conflict[] = [];
  const iso = (t: number) => new Date(t).toISOString();
  const prioOf = new Map(input.participations.map((p) => [p.personId, p.prio]));
  const personPrio = (id?: string | null) => (id ? (prioOf.get(id) ?? 99) : 99);
  const vehicleOf = new Map(input.vehicles.map((v) => [v.id, v]));
  const personOf = new Map(input.persons.map((p) => [p.id, p]));
  const demandOf = new Map(demands.map((d) => [d.key, d]));
  const dist = makeDistanceLookup(input.distances);
  const trips = input.trips.filter((t) => t.status !== 'CANCELLED');

  // --- Demands ---------------------------------------------------------------
  for (const d of demands) {
    const time = d.latestArrival ?? d.earliestDeparture;
    if (d.status === 'INVALID')
      out.push({ code: 'MISSING_LOCATION', severity: 'ERROR', prio: d.prio, time, personId: d.personId, demandKey: d.key, params: { kind: d.kind } });
    else if (d.status === 'OPEN')
      out.push({ code: 'UNCOVERED', severity: 'ERROR', prio: d.prio, time, personId: d.personId, demandKey: d.key, params: { kind: d.kind } });
  }

  // --- Per trip --------------------------------------------------------------
  for (const trip of trips) {
    const stops = [...trip.stops].sort((a, b) => a.order - b.order);
    const stopIdx = new Map(stops.map((s, i) => [s.id, i]));
    const span = tripSpan(trip);
    const vehicle = vehicleOf.get(trip.vehicleId);
    const base = { tripId: trip.id, vehicleId: trip.vehicleId, time: span ? iso(span.start) : null };

    if (stops.some((s, i) => (i > 0 && !s.arrival) || (i < stops.length - 1 && !s.departure)))
      out.push({ ...base, code: 'STOP_TIME_MISSING', severity: 'ERROR', prio: 50 });

    // Driving time plausibility between consecutive stops
    for (let i = 1; i < stops.length; i++) {
      const a = stops[i - 1]!;
      const b = stops[i]!;
      const dep = stopTime(a, 'dep');
      const arr = stopTime(b, 'arr');
      const need = dist(a.locationId, b.locationId, 'VEHICLE');
      if (dep && arr && need !== undefined && ms(arr) - ms(dep) < need * MIN)
        out.push({ ...base, code: 'TIME_TOO_SHORT', severity: 'WARNING', prio: 60, params: { need, planned: Math.round((ms(arr) - ms(dep)) / MIN) } });
    }

    // Passengers: route, timing, load
    const load = new Array(Math.max(stops.length - 1, 0)).fill(0) as number[];
    for (const p of trip.passengers) {
      const fi = stopIdx.get(p.fromStopId);
      const ti = stopIdx.get(p.toStopId);
      const prio = personPrio(p.personId);
      if (fi === undefined || ti === undefined || fi >= ti) {
        out.push({ ...base, code: 'WRONG_ROUTE', severity: 'ERROR', prio, personId: p.personId, demandKey: p.demandKey ?? undefined });
        continue;
      }
      for (let i = fi; i < ti; i++) load[i]!++;
      const from = stops[fi]!;
      const to = stops[ti]!;
      if (!p.demandKey) continue;
      const d = demandOf.get(p.demandKey);
      if (!d) {
        out.push({ ...base, code: 'ORPHAN_PASSENGER', severity: 'ERROR', prio, personId: p.personId, demandKey: p.demandKey });
        continue;
      }
      if (d.fromId !== from.locationId || d.toId !== to.locationId)
        out.push({ ...base, code: 'WRONG_ROUTE', severity: 'ERROR', prio, personId: p.personId, demandKey: d.key });
      const arr = stopTime(to, 'arr');
      if (d.latestArrival && arr && ms(arr) > ms(d.latestArrival))
        out.push({ ...base, code: 'LATE_ARRIVAL', severity: 'ERROR', prio, personId: p.personId, demandKey: d.key, params: { minutes: Math.round((ms(arr) - ms(d.latestArrival)) / MIN) } });
      const dep = stopTime(from, 'dep');
      if (d.earliestDeparture && dep && ms(dep) < ms(d.earliestDeparture))
        out.push({ ...base, code: 'EARLY_PICKUP', severity: 'ERROR', prio, personId: p.personId, demandKey: d.key, params: { minutes: Math.round((ms(d.earliestDeparture) - ms(dep)) / MIN) } });
    }
    if (vehicle) {
      const max = Math.max(0, ...load);
      if (max > vehicle.seats)
        out.push({ ...base, code: 'OVERBOOKED', severity: 'ERROR', prio: 10, params: { load: max, seats: vehicle.seats } });
    }

    // Driver
    if (!trip.driverId) out.push({ ...base, code: 'NO_DRIVER', severity: 'ERROR', prio: 20 });
    else {
      const driver = personOf.get(trip.driverId);
      const lic = driver?.licenses ?? [];
      for (const v of [vehicle, trip.trailerId ? vehicleOf.get(trip.trailerId) : undefined]) {
        if (v?.licenseRequired && !lic.includes(v.licenseRequired))
          out.push({ ...base, code: 'DRIVER_LICENSE', severity: 'ERROR', prio: 20, personId: trip.driverId, params: { license: v.licenseRequired, vehicle: v.name } });
      }
    }
    if (trip.trailerId && vehicle && !vehicle.hasHitch)
      out.push({ ...base, code: 'TRAILER_NO_HITCH', severity: 'ERROR', prio: 20 });
  }

  // --- Vehicle availability & double bookings -------------------------------
  const spans = trips.map((t) => ({ t, span: tripSpan(t) })).filter((x) => x.span) as { t: Trip; span: { start: number; end: number } }[];
  for (const { t, span } of spans) {
    for (const vid of [t.vehicleId, t.trailerId].filter(Boolean) as string[]) {
      const av = input.availabilities.filter((a) => a.vehicleId === vid);
      if (av.length && !av.some((a) => ms(a.from) <= span.start && ms(a.to) >= span.end))
        out.push({ code: 'VEHICLE_UNAVAILABLE', severity: 'ERROR', prio: 15, time: iso(span.start), tripId: t.id, vehicleId: vid });
    }
  }
  for (let i = 0; i < spans.length; i++)
    for (let j = i + 1; j < spans.length; j++) {
      const a = spans[i]!;
      const b = spans[j]!;
      if (!overlaps(a.span.start, a.span.end, b.span.start, b.span.end)) continue;
      const va = [a.t.vehicleId, a.t.trailerId].filter(Boolean);
      const shared = [b.t.vehicleId, b.t.trailerId].filter((v) => v && va.includes(v));
      for (const vid of shared)
        out.push({ code: 'VEHICLE_DOUBLE_BOOKED', severity: 'ERROR', prio: 15, time: iso(b.span.start), tripId: b.t.id, vehicleId: vid!, params: { otherTripId: a.t.id } });
      if (a.t.driverId && a.t.driverId === b.t.driverId)
        out.push({ code: 'DRIVER_BUSY', severity: 'ERROR', prio: 20, time: iso(b.span.start), tripId: b.t.id, personId: b.t.driverId, params: { reason: 'trip' } });
      const pa = new Set(a.t.passengers.map((p) => p.personId));
      for (const p of b.t.passengers)
        if (pa.has(p.personId))
          out.push({ code: 'PASSENGER_DOUBLE_BOOKED', severity: 'ERROR', prio: personPrio(p.personId), time: iso(b.span.start), tripId: b.t.id, personId: p.personId });
    }

  // --- Driver busy with own shift --------------------------------------------
  for (const { t, span } of spans) {
    if (!t.driverId) continue;
    for (const s of input.shifts)
      if (s.personId === t.driverId && overlaps(span.start, span.end, ms(s.start), ms(s.end)))
        out.push({ code: 'DRIVER_BUSY', severity: 'ERROR', prio: 20, time: iso(span.start), tripId: t.id, personId: t.driverId, params: { reason: 'shift' } });
  }

  // --- Driver rest (warning only) -------------------------------------------
  const activity = new Map<string, { start: number; end: number }[]>();
  const add = (pid: string, start: number, end: number) => activity.set(pid, [...(activity.get(pid) ?? []), { start, end }]);
  for (const { t, span } of spans) if (t.driverId) add(t.driverId, span.start, span.end);
  for (const pid of activity.keys())
    for (const s of input.shifts) if (s.personId === pid) add(pid, ms(s.start), ms(s.end));
  for (const [pid, list] of activity) {
    list.sort((a, b) => a.start - b.start);
    // Merge into work blocks separated by >= 3 h breaks; each gap between blocks is a rest period.
    const blocks: { start: number; end: number }[] = [];
    for (const a of list) {
      const last = blocks[blocks.length - 1];
      if (last && a.start - last.end < 3 * HOUR) last.end = Math.max(last.end, a.end);
      else blocks.push({ ...a });
    }
    for (let i = 1; i < blocks.length; i++) {
      const rest = blocks[i]!.start - blocks[i - 1]!.end;
      if (rest < 11 * HOUR)
        out.push({ code: 'DRIVER_REST', severity: 'WARNING', prio: 70, time: iso(blocks[i]!.start), personId: pid, params: { hours: Math.round((rest / HOUR) * 10) / 10 } });
    }
  }

  // --- Vehicle position continuity ------------------------------------------
  const byVehicle = new Map<string, typeof spans>();
  for (const x of spans) byVehicle.set(x.t.vehicleId, [...(byVehicle.get(x.t.vehicleId) ?? []), x]);
  for (const [vid, list] of byVehicle) {
    list.sort((a, b) => a.span.start - b.span.start);
    let at = vehicleOf.get(vid)?.depotLocationId ?? null;
    for (const { t, span } of list) {
      const stops = [...t.stops].sort((a, b) => a.order - b.order);
      if (at && stops[0]!.locationId !== at)
        out.push({ code: 'VEHICLE_POSITION', severity: 'WARNING', prio: 80, time: iso(span.start), tripId: t.id, vehicleId: vid, params: { expected: at } });
      at = stops[stops.length - 1]!.locationId;
    }
  }

  return out.sort(
    (a, b) =>
      sevRank[a.severity] - sevRank[b.severity] || a.prio - b.prio || (a.time ?? '').localeCompare(b.time ?? ''),
  );
}

const sevRank = { ERROR: 0, WARNING: 1, INFO: 2 } as const;
