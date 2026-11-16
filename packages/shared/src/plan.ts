import type { Demand, Distance, PlanInput, PlanResult, Stop, Trip } from './types';
import { deriveDemands, makeDistanceLookup } from './demands';
import { checkConflicts } from './conflicts';
import { addMinutes } from './time';

export function computePlan(input: PlanInput): PlanResult {
  const demands = deriveDemands(input);
  return { demands, conflicts: checkConflicts(input, demands) };
}

export const DEFAULT_DRIVE_MIN = 30;

/**
 * Proposes stop times for a new trip that serves one demand:
 * arrive exactly at the deadline (or depart at earliest departure if no deadline).
 */
export function proposeTripForDemand(
  demand: Demand,
  distances: Distance[],
): { stops: Omit<Stop, 'id'>[] } | null {
  if (!demand.fromId || !demand.toId) return null;
  const drive = makeDistanceLookup(distances)(demand.fromId, demand.toId, 'VEHICLE') ?? DEFAULT_DRIVE_MIN;
  let departure: string;
  let arrival: string;
  if (demand.latestArrival) {
    arrival = demand.latestArrival;
    departure = addMinutes(arrival, -drive);
  } else if (demand.earliestDeparture) {
    departure = demand.earliestDeparture;
    arrival = addMinutes(departure, drive);
  } else return null;
  return {
    stops: [
      { order: 0, locationId: demand.fromId, arrival: null, departure },
      { order: 1, locationId: demand.toId, arrival, departure: null },
    ],
  };
}

/** Free seats on the leg range of a trip (min over legs). */
export function freeSeats(trip: Trip, seats: number, fromStopId: string, toStopId: string): number {
  const stops = [...trip.stops].sort((a, b) => a.order - b.order);
  const idx = new Map(stops.map((s, i) => [s.id, i]));
  const fi = idx.get(fromStopId);
  const ti = idx.get(toStopId);
  if (fi === undefined || ti === undefined || fi >= ti) return 0;
  let max = 0;
  for (let leg = fi; leg < ti; leg++) {
    const n = trip.passengers.filter((p) => (idx.get(p.fromStopId) ?? 99) <= leg && (idx.get(p.toStopId) ?? -1) > leg).length;
    max = Math.max(max, n);
  }
  return seats - max;
}
