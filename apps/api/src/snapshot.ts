import type { PrismaClient } from '@prisma/client';
import type { PlanInput, Trip } from '@mb/shared';

const isoOrNull = (d: Date | null | undefined) => (d ? d.toISOString() : null);

/** Loads everything the planner needs for one event, mapped to shared domain types. */
export async function loadPlanInput(db: PrismaClient, eventId: string): Promise<PlanInput> {
  const event = await db.event.findUniqueOrThrow({ where: { id: eventId } });
  const [locations, participations, lodgings, shifts, vehicles, distances, trips, overrides] = await Promise.all([
    db.location.findMany({ orderBy: { name: 'asc' } }),
    db.participation.findMany({ where: { eventId }, include: { person: true } }),
    db.lodging.findMany({ where: { eventId } }),
    db.shift.findMany({ where: { eventId }, orderBy: { start: 'asc' } }),
    db.vehicle.findMany({ include: { availabilities: true }, orderBy: { name: 'asc' } }),
    db.distance.findMany(),
    db.trip.findMany({ where: { eventId }, include: { stops: true, passengers: true } }),
    db.demandOverride.findMany({ where: { eventId } }),
  ]);

  return {
    event: {
      id: event.id,
      name: event.name,
      startDate: event.startDate,
      endDate: event.endDate,
      defaultBufferMin: event.defaultBufferMin,
      walkThresholdMin: event.walkThresholdMin,
      selfEditLockHours: event.selfEditLockHours,
    },
    locations,
    persons: participations
      .map((p) => ({ id: p.person.id, name: p.person.name, phone: p.person.phone, email: p.person.email, licenses: p.person.licenses }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    participations: participations.map((p) => ({
      id: p.id,
      personId: p.personId,
      prio: p.prio,
      startLocationId: p.startLocationId,
      earliestDeparture: isoOrNull(p.earliestDeparture),
      endLocationId: p.endLocationId,
      latestArrival: isoOrNull(p.latestArrival),
      defaultLodgingId: p.defaultLodgingId,
    })),
    lodgings: lodgings.map((l) => ({ personId: l.personId, night: l.night, locationId: l.locationId })),
    shifts: shifts.map((s) => ({ ...s, start: s.start.toISOString(), end: s.end.toISOString() })),
    vehicles: vehicles.map(({ availabilities: _a, ...v }) => v),
    availabilities: vehicles.flatMap((v) =>
      v.availabilities.map((a) => ({ vehicleId: v.id, from: a.from.toISOString(), to: a.to.toISOString() })),
    ),
    distances,
    trips: trips.map(
      (t): Trip => ({
        id: t.id,
        vehicleId: t.vehicleId,
        trailerId: t.trailerId,
        driverId: t.driverId,
        status: t.status,
        note: t.note,
        stops: t.stops
          .sort((a, b) => a.order - b.order)
          .map((s) => ({ id: s.id, order: s.order, locationId: s.locationId, arrival: isoOrNull(s.arrival), departure: isoOrNull(s.departure) })),
        passengers: t.passengers.map((p) => ({ id: p.id, personId: p.personId, fromStopId: p.fromStopId, toStopId: p.toStopId, demandKey: p.demandKey })),
      }),
    ),
    overrides: overrides.map((o) => ({ demandKey: o.demandKey, kind: o.kind, note: o.note })),
  };
}
