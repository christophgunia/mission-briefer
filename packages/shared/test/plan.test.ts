import { describe, expect, it } from 'vitest';
import { computePlan, proposeTripForDemand, freeSeats } from '../src';
import type { PlanInput, Trip } from '../src';

const T = (d: string, hm: string) => `${d}T${hm}:00.000Z`;

function base(): PlanInput {
  return {
    event: { id: 'e', name: 'Fest', startDate: '2026-06-01', endDate: '2026-06-03', defaultBufferMin: 15, walkThresholdMin: 10, selfEditLockHours: 2 },
    locations: [
      { id: 'home', name: 'Zuhause', type: 'OTHER' },
      { id: 'hotel', name: 'Hotel', type: 'LODGING' },
      { id: 'hallA', name: 'Halle A', type: 'VENUE', bufferMin: 30 },
      { id: 'hallB', name: 'Halle B', type: 'VENUE' },
      { id: 'depot', name: 'Depot', type: 'DEPOT' },
    ],
    persons: [
      { id: 'p1', name: 'Techniker', licenses: [] },
      { id: 'd1', name: 'Fahrer', licenses: ['B'] },
    ],
    participations: [
      { id: 'pa1', personId: 'p1', prio: 1, startLocationId: 'home', endLocationId: 'home', defaultLodgingId: 'hotel' },
    ],
    lodgings: [],
    shifts: [
      { id: 's1', personId: 'p1', date: '2026-06-01', start: T('2026-06-01', '08:00'), end: T('2026-06-01', '12:00'), locationId: 'hallA' },
      { id: 's2', personId: 'p1', date: '2026-06-01', start: T('2026-06-01', '13:00'), end: T('2026-06-01', '18:00'), locationId: 'hallB' },
      { id: 's3', personId: 'p1', date: '2026-06-02', start: T('2026-06-02', '08:00'), end: T('2026-06-02', '16:00'), locationId: 'hallA' },
    ],
    vehicles: [{ id: 'v1', name: 'Bus 1', type: 'VAN', seats: 1, hasHitch: false, depotLocationId: 'depot' }],
    availabilities: [],
    distances: [{ fromId: 'home', toId: 'hallA', kind: 'VEHICLE', minutes: 40 }],
    trips: [],
    overrides: [],
  };
}

describe('deriveDemands', () => {
  it('derives arrival, transfer, evening, morning and departure', () => {
    const { demands } = computePlan(base());
    expect(demands.map((d) => d.key)).toEqual([
      'p1:ARRIVAL',
      'p1:TRANSFER:s1',
      'p1:EVENING:2026-06-01',
      'p1:MORNING:2026-06-02',
      'p1:DEPARTURE',
    ]);
    const arrival = demands[0]!;
    expect(arrival).toMatchObject({ fromId: 'home', toId: 'hallA', latestArrival: T('2026-06-01', '07:30'), status: 'OPEN' });
    const morning = demands.find((d) => d.kind === 'MORNING')!;
    expect(morning.fromId).toBe('hotel');
  });

  it('uses explicit lodging per night over default', () => {
    const input = base();
    input.lodgings = [{ personId: 'p1', night: '2026-06-01', locationId: 'home' }];
    const { demands } = computePlan(input);
    expect(demands.find((d) => d.kind === 'EVENING')!.toId).toBe('home');
    expect(demands.find((d) => d.kind === 'MORNING')!.fromId).toBe('home');
  });

  it('marks short walks as WALK and missing locations as INVALID', () => {
    const input = base();
    input.distances.push({ fromId: 'hallB', toId: 'hallA', kind: 'WALK', minutes: 5 });
    input.participations[0]!.endLocationId = null;
    const { demands, conflicts } = computePlan(input);
    expect(demands.find((d) => d.kind === 'TRANSFER')!.status).toBe('WALK');
    expect(demands.find((d) => d.kind === 'DEPARTURE')!.status).toBe('INVALID');
    expect(conflicts.some((c) => c.code === 'MISSING_LOCATION')).toBe(true);
  });

  it('applies dispatcher overrides', () => {
    const input = base();
    input.overrides = [{ demandKey: 'p1:DEPARTURE', kind: 'PUBLIC', note: 'Zug' }];
    expect(computePlan(input).demands.find((d) => d.kind === 'DEPARTURE')!.status).toBe('ALTERNATIVE');
  });
});

describe('checkConflicts', () => {
  const trip = (over: Partial<Trip> = {}): Trip => ({
    id: 't1',
    vehicleId: 'v1',
    driverId: 'd1',
    status: 'PLANNED',
    stops: [
      { id: 'a', order: 0, locationId: 'depot', departure: T('2026-06-01', '06:00') },
      { id: 'b', order: 1, locationId: 'home', arrival: T('2026-06-01', '06:30'), departure: T('2026-06-01', '06:40') },
      { id: 'c', order: 2, locationId: 'hallA', arrival: T('2026-06-01', '07:25') },
    ],
    passengers: [{ id: 'x', personId: 'p1', fromStopId: 'b', toStopId: 'c', demandKey: 'p1:ARRIVAL' }],
    ...over,
  });

  it('covers demand without conflicts for a valid trip', () => {
    const input = base();
    input.trips = [trip()];
    const { demands, conflicts } = computePlan(input);
    expect(demands[0]!.status).toBe('COVERED');
    expect(conflicts.filter((c) => c.tripId === 't1')).toEqual([]);
  });

  it('detects late arrival, overbooking, missing licence', () => {
    const input = base();
    input.persons.push({ id: 'p2', name: 'Stand', licenses: [] });
    input.vehicles[0]!.licenseRequired = 'C';
    const t = trip();
    t.stops[2]!.arrival = T('2026-06-01', '07:45');
    t.passengers.push({ id: 'y', personId: 'p2', fromStopId: 'a', toStopId: 'c' });
    input.trips = [t];
    const codes = computePlan(input).conflicts.map((c) => c.code);
    expect(codes).toContain('LATE_ARRIVAL');
    expect(codes).toContain('OVERBOOKED');
    expect(codes).toContain('DRIVER_LICENSE');
  });

  it('detects double booking, unavailability and driver shift clash', () => {
    const input = base();
    input.availabilities = [{ vehicleId: 'v1', from: T('2026-06-01', '10:00'), to: T('2026-06-01', '20:00') }];
    input.shifts.push({ id: 'ds', personId: 'd1', date: '2026-06-01', start: T('2026-06-01', '07:00'), end: T('2026-06-01', '09:00'), locationId: 'hallA' });
    input.trips = [trip(), trip({ id: 't2', passengers: [] })];
    const codes = computePlan(input).conflicts.map((c) => c.code);
    expect(codes).toContain('VEHICLE_UNAVAILABLE');
    expect(codes).toContain('VEHICLE_DOUBLE_BOOKED');
    expect(codes).toContain('DRIVER_BUSY');
  });

  it('flags orphan passengers after shift changes', () => {
    const input = base();
    input.trips = [trip({ passengers: [{ id: 'x', personId: 'p1', fromStopId: 'b', toStopId: 'c', demandKey: 'p1:GONE' }] })];
    expect(computePlan(input).conflicts.map((c) => c.code)).toContain('ORPHAN_PASSENGER');
  });

  it('warns on short driver rest', () => {
    const input = base();
    input.shifts.push(
      { id: 'd-a', personId: 'd1', date: '2026-06-01', start: T('2026-06-01', '14:00'), end: T('2026-06-01', '23:00'), locationId: 'hallA' },
    );
    input.trips = [trip({ stops: [
      { id: 'a', order: 0, locationId: 'depot', departure: T('2026-06-02', '05:00') },
      { id: 'c', order: 1, locationId: 'hallA', arrival: T('2026-06-02', '05:30') },
    ], passengers: [] })];
    const rest = computePlan(input).conflicts.find((c) => c.code === 'DRIVER_REST');
    expect(rest?.severity).toBe('WARNING');
    expect(rest?.params?.hours).toBe(6);
  });
});

describe('helpers', () => {
  it('proposes a trip arriving at the deadline', () => {
    const { demands } = computePlan(base());
    const p = proposeTripForDemand(demands[0]!, base().distances)!;
    expect(p.stops[0]!.departure).toBe(T('2026-06-01', '06:50'));
    expect(p.stops[1]!.arrival).toBe(T('2026-06-01', '07:30'));
  });

  it('computes free seats per leg', () => {
    const t: Trip = {
      id: 't', vehicleId: 'v', status: 'PLANNED',
      stops: [{ id: 'a', order: 0, locationId: 'x' }, { id: 'b', order: 1, locationId: 'y' }, { id: 'c', order: 2, locationId: 'z' }],
      passengers: [{ id: '1', personId: 'p', fromStopId: 'a', toStopId: 'b' }],
    };
    expect(freeSeats(t, 3, 'b', 'c')).toBe(3);
    expect(freeSeats(t, 3, 'a', 'c')).toBe(2);
  });
});

import { zonedToIso } from '../src';
describe('zonedToIso', () => {
  it('handles CET and CEST', () => {
    expect(zonedToIso('2026-01-10', '08:00', 'Europe/Berlin')).toBe('2026-01-10T07:00:00.000Z');
    expect(zonedToIso('2026-07-10', '08:00', 'Europe/Berlin')).toBe('2026-07-10T06:00:00.000Z');
  });
});
