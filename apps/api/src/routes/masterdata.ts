import type { FastifyInstance } from 'fastify';
import { DistanceInput, LocationInput, VehicleInput } from '@mb/shared';

/** Global master data: locations, vehicles, distance matrix. */
export async function masterDataRoutes(app: FastifyInstance) {
  const dispatch = { preHandler: app.requireRole('ADMIN', 'DISPATCHER') };
  const anyUser = { preHandler: app.requireRole() };
  type P = { Params: { id: string } };

  // Locations ---------------------------------------------------------------
  app.get('/locations', anyUser, async () => app.db.location.findMany({ orderBy: { name: 'asc' } }));
  app.post('/locations', dispatch, async (req) => app.db.location.create({ data: LocationInput.parse(req.body) }));
  app.put<P>('/locations/:id', dispatch, async (req) =>
    app.db.location.update({ where: { id: req.params.id }, data: LocationInput.partial().parse(req.body) }),
  );
  app.delete<P>('/locations/:id', dispatch, async (req) => {
    await app.db.$transaction([
      app.db.distance.deleteMany({ where: { OR: [{ fromId: req.params.id }, { toId: req.params.id }] } }),
      app.db.location.delete({ where: { id: req.params.id } }),
    ]);
    return { ok: true };
  });

  // Vehicles ----------------------------------------------------------------
  app.get('/vehicles', anyUser, async () =>
    app.db.vehicle.findMany({ include: { availabilities: { orderBy: { from: 'asc' } } }, orderBy: { name: 'asc' } }),
  );
  app.post('/vehicles', dispatch, async (req) => {
    const { availabilities, ...data } = VehicleInput.parse(req.body);
    return app.db.vehicle.create({ data: { ...data, availabilities: { create: availabilities } }, include: { availabilities: true } });
  });
  app.put<P>('/vehicles/:id', dispatch, async (req) => {
    const { availabilities, ...data } = VehicleInput.partial().parse(req.body);
    return app.db.$transaction(async (tx) => {
      if (availabilities) {
        await tx.availability.deleteMany({ where: { vehicleId: req.params.id } });
        await tx.availability.createMany({ data: availabilities.map((a) => ({ ...a, vehicleId: req.params.id })) });
      }
      return tx.vehicle.update({ where: { id: req.params.id }, data, include: { availabilities: true } });
    });
  });
  app.delete<P>('/vehicles/:id', dispatch, async (req) => {
    await app.db.vehicle.delete({ where: { id: req.params.id } });
    return { ok: true };
  });

  // Distances (matrix) ------------------------------------------------------
  app.get('/distances', anyUser, async () => app.db.distance.findMany());
  /** Upsert many cells; minutes = null deletes the cell. */
  app.put('/distances', dispatch, async (req) => {
    const { entries } = DistanceInput.parse(req.body);
    await app.db.$transaction(
      entries.map(({ minutes, ...key }) =>
        minutes === null
          ? app.db.distance.deleteMany({ where: key })
          : app.db.distance.upsert({
              where: { fromId_toId_kind: key },
              create: { ...key, minutes },
              update: { minutes, source: 'manual' },
            }),
      ),
    );
    return { ok: true, count: entries.length };
  });
}
