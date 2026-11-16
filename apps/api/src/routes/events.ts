import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  BulkDeleteShiftsInput,
  BulkLodgingInput,
  BulkShiftInput,
  EventInput,
  ParticipationInput,
  PersonInput,
  ShiftInput,
  TeamInput,
  zonedToIso,
} from '@mb/shared';

const ParticipantRow = PersonInput.extend(ParticipationInput.omit({ personId: true }).shape).extend({
  personId: z.string().nullish(),
  teamIds: z.array(z.string()).optional(),
});

/** Event-scoped data: event, participants, teams, shifts, lodgings. */
export async function eventRoutes(app: FastifyInstance) {
  const dispatch = { preHandler: app.requireRole('ADMIN', 'DISPATCHER') };
  const anyUser = { preHandler: app.requireRole() };
  type E = { Params: { eventId: string } };
  type EI = { Params: { eventId: string; id: string } };

  const audit = (eventId: string, userId: string, action: string, entity: string, data?: unknown) =>
    app.db.auditLog.create({ data: { eventId, userId, action, entity, data: data as object } });

  // Events ------------------------------------------------------------------
  app.get('/events', anyUser, async () => app.db.event.findMany({ orderBy: { startDate: 'desc' } }));
  app.post('/events', dispatch, async (req) => app.db.event.create({ data: EventInput.parse(req.body) }));
  app.get<E>('/events/:eventId', anyUser, async (req) => app.db.event.findUniqueOrThrow({ where: { id: req.params.eventId } }));
  app.put<E>('/events/:eventId', dispatch, async (req) =>
    app.db.event.update({ where: { id: req.params.eventId }, data: EventInput.partial().parse(req.body) }),
  );
  app.delete<E>('/events/:eventId', dispatch, async (req) => {
    await app.db.event.delete({ where: { id: req.params.eventId } });
    return { ok: true };
  });

  // Participants (person + participation + teams as one grid row) ------------
  app.get<E>('/events/:eventId/participants', anyUser, async (req) => {
    const { eventId } = req.params;
    const [parts, members] = await Promise.all([
      app.db.participation.findMany({ where: { eventId }, include: { person: true } }),
      app.db.teamMember.findMany({ where: { team: { eventId } } }),
    ]);
    return parts
      .map((p) => ({
        ...p.person,
        personId: p.personId,
        prio: p.prio,
        startLocationId: p.startLocationId,
        earliestDeparture: p.earliestDeparture,
        endLocationId: p.endLocationId,
        latestArrival: p.latestArrival,
        defaultLodgingId: p.defaultLodgingId,
        teamIds: members.filter((m) => m.personId === p.personId).map((m) => m.teamId),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  /** Create or update many participant rows at once (grid save, CSV import). */
  app.put<E>('/events/:eventId/participants', dispatch, async (req) => {
    const { eventId } = req.params;
    const rows = z.array(ParticipantRow).parse(req.body);
    const ids = await app.db.$transaction(async (tx) => {
      const out: string[] = [];
      for (const row of rows) {
        const { personId, name, phone, email, licenses, teamIds, ...part } = row;
        const personData = { name, phone, email: email || null, licenses };
        const person = personId
          ? await tx.person.update({ where: { id: personId }, data: personData })
          : await tx.person.create({ data: personData });
        await tx.participation.upsert({
          where: { eventId_personId: { eventId, personId: person.id } },
          create: { eventId, personId: person.id, ...part },
          update: part,
        });
        if (teamIds) {
          await tx.teamMember.deleteMany({ where: { personId: person.id, team: { eventId } } });
          if (teamIds.length) await tx.teamMember.createMany({ data: teamIds.map((teamId) => ({ teamId, personId: person.id })) });
        }
        out.push(person.id);
      }
      return out;
    });
    return { ok: true, personIds: ids };
  });

  app.delete<EI>('/events/:eventId/participants/:id', dispatch, async (req) => {
    const { eventId, id } = req.params;
    await app.db.$transaction([
      app.db.shift.deleteMany({ where: { eventId, personId: id } }),
      app.db.lodging.deleteMany({ where: { eventId, personId: id } }),
      app.db.teamMember.deleteMany({ where: { personId: id, team: { eventId } } }),
      app.db.participation.delete({ where: { eventId_personId: { eventId, personId: id } } }),
    ]);
    return { ok: true };
  });

  // Teams -------------------------------------------------------------------
  app.get<E>('/events/:eventId/teams', anyUser, async (req) => {
    const teams = await app.db.team.findMany({ where: { eventId: req.params.eventId }, include: { members: true }, orderBy: { name: 'asc' } });
    return teams.map(({ members, ...t }) => ({ ...t, memberIds: members.map((m) => m.personId) }));
  });
  app.post<E>('/events/:eventId/teams', dispatch, async (req) => {
    const { memberIds, ...data } = TeamInput.parse(req.body);
    return app.db.team.create({
      data: { ...data, eventId: req.params.eventId, members: { create: memberIds.map((personId) => ({ personId })) } },
    });
  });
  app.put<EI>('/events/:eventId/teams/:id', dispatch, async (req) => {
    const { memberIds, ...data } = TeamInput.partial().parse(req.body);
    return app.db.$transaction(async (tx) => {
      if (memberIds) {
        await tx.teamMember.deleteMany({ where: { teamId: req.params.id } });
        await tx.teamMember.createMany({ data: memberIds.map((personId) => ({ teamId: req.params.id, personId })) });
      }
      return tx.team.update({ where: { id: req.params.id }, data });
    });
  });
  app.delete<EI>('/events/:eventId/teams/:id', dispatch, async (req) => {
    await app.db.team.delete({ where: { id: req.params.id } });
    return { ok: true };
  });

  // Shifts ------------------------------------------------------------------
  app.get<E>('/events/:eventId/shifts', anyUser, async (req) =>
    app.db.shift.findMany({ where: { eventId: req.params.eventId }, orderBy: [{ date: 'asc' }, { start: 'asc' }] }),
  );
  app.post<E>('/events/:eventId/shifts', dispatch, async (req) =>
    app.db.shift.create({ data: { ...ShiftInput.parse(req.body), eventId: req.params.eventId } }),
  );
  app.put<EI>('/events/:eventId/shifts/:id', dispatch, async (req) => {
    const data = ShiftInput.partial().parse(req.body);
    const s = await app.db.shift.update({ where: { id: req.params.id }, data });
    await audit(req.params.eventId, req.user.id, 'update', 'shift', { id: s.id, ...data });
    return s;
  });
  app.delete<EI>('/events/:eventId/shifts/:id', dispatch, async (req) => {
    await app.db.shift.delete({ where: { id: req.params.id } });
    return { ok: true };
  });

  /** Same shift for many persons × many days (team planning). Overnight shifts end on the next day. */
  app.post<E>('/events/:eventId/shifts/bulk', dispatch, async (req) => {
    const { eventId } = req.params;
    const input = BulkShiftInput.parse(req.body);
    const rows = input.personIds.flatMap((personId) =>
      input.dates.map((date) => {
        const start = zonedToIso(date, input.start, input.timeZone);
        let end = zonedToIso(date, input.end, input.timeZone);
        if (end <= start) end = new Date(Date.parse(end) + 24 * 3600_000).toISOString();
        return { eventId, personId, date, start, end, locationId: input.locationId, note: input.note, teamId: input.teamId };
      }),
    );
    await app.db.$transaction([
      ...(input.replace
        ? [app.db.shift.deleteMany({ where: { eventId, personId: { in: input.personIds }, date: { in: input.dates } } })]
        : []),
      app.db.shift.createMany({ data: rows }),
    ]);
    await audit(eventId, req.user.id, 'bulk_set', 'shift', input);
    return { ok: true, count: rows.length };
  });

  app.post<E>('/events/:eventId/shifts/bulk-delete', dispatch, async (req) => {
    const { eventId } = req.params;
    const input = BulkDeleteShiftsInput.parse(req.body);
    const res = await app.db.shift.deleteMany({ where: { eventId, personId: { in: input.personIds }, date: { in: input.dates } } });
    await audit(eventId, req.user.id, 'bulk_delete', 'shift', input);
    return { ok: true, count: res.count };
  });

  // Lodgings ----------------------------------------------------------------
  app.get<E>('/events/:eventId/lodgings', anyUser, async (req) => app.db.lodging.findMany({ where: { eventId: req.params.eventId } }));
  /** Set many matrix cells; locationId = null clears the cell (falls back to default lodging). */
  app.put<E>('/events/:eventId/lodgings', dispatch, async (req) => {
    const { eventId } = req.params;
    const { entries } = BulkLodgingInput.parse(req.body);
    await app.db.$transaction(
      entries.map(({ personId, night, locationId }) =>
        locationId
          ? app.db.lodging.upsert({
              where: { eventId_personId_night: { eventId, personId, night } },
              create: { eventId, personId, night, locationId },
              update: { locationId },
            })
          : app.db.lodging.deleteMany({ where: { eventId, personId, night } }),
      ),
    );
    return { ok: true, count: entries.length };
  });
}
