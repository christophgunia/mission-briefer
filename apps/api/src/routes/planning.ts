import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { OverrideInput, TripInput, computePlan, type TripInputT } from '@mb/shared';
import { loadPlanInput } from '../snapshot';

/** Planning: full snapshot with demands/conflicts, trips, demand overrides. */
export async function planningRoutes(app: FastifyInstance) {
  const dispatch = { preHandler: app.requireRole('ADMIN', 'DISPATCHER') };
  type E = { Params: { eventId: string } };
  type EI = { Params: { eventId: string; id: string } };

  /** Everything the board needs in one call, incl. derived demands and conflicts. */
  app.get<E>('/events/:eventId/plan', dispatch, async (req) => {
    const input = await loadPlanInput(app.db, req.params.eventId);
    return { ...input, ...computePlan(input) };
  });

  const writeTrip = async (tx: Prisma.TransactionClient, tripId: string, input: TripInputT) => {
    const refToId = new Map<string, string>();
    for (const [order, s] of input.stops.entries()) {
      const stop = await tx.stop.create({
        data: { tripId, order, locationId: s.locationId, arrival: s.arrival ?? null, departure: s.departure ?? null },
      });
      refToId.set(s.ref, stop.id);
    }
    const passengers = input.passengers.map((p) => {
      const fromStopId = refToId.get(p.fromRef);
      const toStopId = refToId.get(p.toRef);
      if (!fromStopId || !toStopId) throw Object.assign(new Error('unknown stop ref'), { statusCode: 400 });
      return { tripId, personId: p.personId, fromStopId, toStopId, demandKey: p.demandKey ?? null };
    });
    if (passengers.length) await tx.passenger.createMany({ data: passengers });
  };

  app.post<E>('/events/:eventId/trips', dispatch, async (req) => {
    const input = TripInput.parse(req.body);
    return app.db.$transaction(async (tx) => {
      const trip = await tx.trip.create({
        data: {
          eventId: req.params.eventId,
          vehicleId: input.vehicleId,
          trailerId: input.trailerId ?? null,
          driverId: input.driverId ?? null,
          status: input.status,
          note: input.note ?? null,
        },
      });
      await writeTrip(tx, trip.id, input);
      return { id: trip.id };
    });
  });

  /** Replaces the trip completely (stops and passengers are rewritten). */
  app.put<EI>('/events/:eventId/trips/:id', dispatch, async (req) => {
    const input = TripInput.parse(req.body);
    const { id } = req.params;
    return app.db.$transaction(async (tx) => {
      await tx.passenger.deleteMany({ where: { tripId: id } });
      await tx.stop.deleteMany({ where: { tripId: id } });
      await tx.trip.update({
        where: { id },
        data: {
          vehicleId: input.vehicleId,
          trailerId: input.trailerId ?? null,
          driverId: input.driverId ?? null,
          status: input.status,
          note: input.note ?? null,
        },
      });
      await writeTrip(tx, id, input);
      return { id };
    });
  });

  app.delete<EI>('/events/:eventId/trips/:id', dispatch, async (req) => {
    await app.db.trip.delete({ where: { id: req.params.id } });
    return { ok: true };
  });

  /** Mark a demand as solved otherwise (walk, public transport, taxi …); kind = null removes the override. */
  app.put<E>('/events/:eventId/overrides', dispatch, async (req) => {
    const { eventId } = req.params;
    const { demandKey, kind, note } = OverrideInput.parse(req.body);
    if (kind === null) {
      await app.db.demandOverride.deleteMany({ where: { eventId, demandKey } });
      return { ok: true };
    }
    return app.db.demandOverride.upsert({
      where: { eventId_demandKey: { eventId, demandKey } },
      create: { eventId, demandKey, kind, note },
      update: { kind, note },
    });
  });
}
