/** Demo data: one 3-day event, 5 locations, 24 persons in 3 teams, 4 vehicles. */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { dateRange, zonedToIso } from '@mb/shared';

const db = new PrismaClient();
const TZ = 'Europe/Berlin';

async function main() {
  await db.event.deleteMany();
  await db.distance.deleteMany();
  await db.location.deleteMany();
  await db.vehicle.deleteMany();
  await db.person.deleteMany();
  await db.user.deleteMany();

  await db.user.create({
    data: { email: 'admin@example.com', passwordHash: await bcrypt.hash('admin', 10), role: 'ADMIN' },
  });

  const loc = async (name: string, type: 'LODGING' | 'VENUE' | 'DEPOT' | 'STATION' | 'OTHER', bufferMin?: number) =>
    (await db.location.create({ data: { name, type, bufferMin } })).id;
  const hotelA = await loc('Hotel Am Markt', 'LODGING');
  const hotelB = await loc('Pension Seeblick', 'LODGING');
  const hall = await loc('Messehalle 3', 'VENUE', 30);
  const stage = await loc('Freilichtbühne', 'VENUE');
  const depot = await loc('Fuhrpark Nord', 'DEPOT');
  const station = await loc('Hauptbahnhof', 'STATION');

  const d = (fromId: string, toId: string, minutes: number, kind: 'VEHICLE' | 'WALK' = 'VEHICLE') => ({ fromId, toId, minutes, kind });
  await db.distance.createMany({
    data: [
      d(hotelA, hall, 15), d(hotelB, hall, 25), d(hotelA, stage, 20), d(hotelB, stage, 10),
      d(hall, stage, 12), d(depot, hotelA, 10), d(depot, hotelB, 20), d(depot, hall, 15),
      d(station, hall, 20), d(station, hotelA, 8), d(station, hotelB, 18),
      d(hotelB, stage, 8, 'WALK'), d(hall, stage, 25, 'WALK'),
    ],
  });

  const event = await db.event.create({
    data: { name: 'Stadtfest 2026', startDate: '2026-06-12', endDate: '2026-06-14', defaultBufferMin: 15, walkThresholdMin: 10 },
  });
  const days = dateRange(event.startDate, event.endDate);

  const teams = [
    { name: 'Technik', color: '#e8590c', prio: 1, venue: hall, start: '07:00', end: '16:00' },
    { name: 'Bühne', color: '#7048e8', prio: 2, venue: stage, start: '12:00', end: '22:00' },
    { name: 'Standpersonal', color: '#2f9e44', prio: 5, venue: hall, start: '09:00', end: '18:00' },
  ];
  const first = ['Anna', 'Ben', 'Clara', 'David', 'Emma', 'Felix', 'Greta', 'Hannes'];
  const last = ['Müller', 'Schmidt', 'Weber'];

  for (const [ti, t] of teams.entries()) {
    const team = await db.team.create({ data: { eventId: event.id, name: t.name, color: t.color } });
    for (const [i, fn] of first.entries()) {
      const person = await db.person.create({
        data: {
          name: `${fn} ${last[ti]}`,
          phone: `+49 151 ${String(1000000 + ti * 100 + i)}`,
          licenses: i % 3 === 0 ? ['B', 'BE'] : i % 4 === 1 ? ['B', 'C', 'CE'] : ['B'],
        },
      });
      await db.participation.create({
        data: {
          eventId: event.id,
          personId: person.id,
          prio: t.prio,
          startLocationId: station,
          endLocationId: station,
          defaultLodgingId: i % 2 ? hotelA : hotelB,
          earliestDeparture: zonedToIso(days[0]!, '05:30', TZ),
        },
      });
      await db.teamMember.create({ data: { teamId: team.id, personId: person.id, isLead: i === 0 } });
      await db.shift.createMany({
        data: days.map((date) => ({
          eventId: event.id,
          personId: person.id,
          date,
          start: zonedToIso(date, t.start, TZ),
          end: zonedToIso(date, t.end, TZ),
          locationId: t.venue,
          teamId: team.id,
        })),
      });
    }
  }

  const vehicles = [
    { name: 'Bus 1 (9-Sitzer)', type: 'VAN' as const, seats: 8, licenseRequired: 'B', hasHitch: true },
    { name: 'Bus 2 (9-Sitzer)', type: 'VAN' as const, seats: 8, licenseRequired: 'B', hasHitch: false },
    { name: 'PKW Kombi', type: 'CAR' as const, seats: 4, licenseRequired: 'B', hasHitch: true },
    { name: 'LKW 7,5t', type: 'TRUCK' as const, seats: 2, licenseRequired: 'C', hasHitch: true },
    { name: 'Anhänger Technik', type: 'TRAILER' as const, seats: 0, licenseRequired: 'BE', hasHitch: false },
  ];
  for (const v of vehicles)
    await db.vehicle.create({
      data: {
        ...v,
        depotLocationId: depot,
        availabilities: { create: [{ from: zonedToIso(days[0]!, '04:00', TZ), to: zonedToIso(days[2]!, '23:59', TZ) }] },
      },
    });

  console.log(`Seeded event ${event.id}. Login: admin@example.com / admin`);
}

main().finally(() => db.$disconnect());
