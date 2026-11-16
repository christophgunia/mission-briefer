/**
 * Integration test against a real PostgreSQL (DATABASE_URL). Seeds via `pnpm db:seed` beforehand.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import { buildApp } from '../src/app';

let app: Awaited<ReturnType<typeof buildApp>>;
let cookie = '';
let eventId = '';

const req = async (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown) => {
  const res = await app.inject({ method, url, payload: payload as object, headers: { cookie } });
  return { status: res.statusCode, body: res.json() };
};

beforeAll(async () => {
  execSync('pnpm db:seed', { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' });
  app = await buildApp();
  const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'admin@example.com', password: 'admin' } });
  cookie = `mb_session=${res.cookies.find((c) => c.name === 'mb_session')!.value}`;
  eventId = (await req('GET', '/api/events')).body[0].id;
}, 60_000);

afterAll(() => app.close());

describe('API', () => {
  it('rejects anonymous access', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/events' });
    expect(res.statusCode).toBe(401);
  });

  it('returns plan with derived demands and conflicts', async () => {
    const { status, body } = await req('GET', `/api/events/${eventId}/plan`);
    expect(status).toBe(200);
    expect(body.persons).toHaveLength(24);
    // 24 persons × (arrival + 2 evenings + 2 mornings + departure) – Bühne team walks from Seeblick
    expect(body.demands.length).toBe(24 * 6);
    expect(body.conflicts.filter((c: { code: string }) => c.code === 'UNCOVERED').length).toBeGreaterThan(0);
  });

  it('bulk-sets team shifts across days and recomputes demands', async () => {
    const plan = (await req('GET', `/api/events/${eventId}/plan`)).body;
    const stage = plan.locations.find((l: { name: string }) => l.name === 'Freilichtbühne').id;
    const persons = plan.persons.slice(0, 3).map((p: { id: string }) => p.id);
    const res = await req('POST', `/api/events/${eventId}/shifts/bulk`, {
      personIds: persons,
      dates: ['2026-06-13', '2026-06-14'],
      start: '18:00',
      end: '02:00',
      locationId: stage,
    });
    expect(res.body.count).toBe(6);
    const shifts = (await req('GET', `/api/events/${eventId}/shifts`)).body.filter(
      (s: { personId: string; date: string }) => s.personId === persons[0] && s.date === '2026-06-13',
    );
    expect(shifts).toHaveLength(1);
    expect(shifts[0].start).toBe('2026-06-13T16:00:00.000Z');
    expect(shifts[0].end).toBe('2026-06-14T00:00:00.000Z');
  });

  it('bulk-sets lodgings', async () => {
    const plan = (await req('GET', `/api/events/${eventId}/plan`)).body;
    const hotel = plan.locations.find((l: { type: string }) => l.type === 'LODGING').id;
    const entries = plan.persons.slice(0, 5).map((p: { id: string }) => ({ personId: p.id, night: '2026-06-12', locationId: hotel }));
    expect((await req('PUT', `/api/events/${eventId}/lodgings`, { entries })).body.count).toBe(5);
    expect((await req('GET', `/api/events/${eventId}/lodgings`)).body).toHaveLength(5);
  });

  it('creates a trip that covers a demand', async () => {
    const plan = (await req('GET', `/api/events/${eventId}/plan`)).body;
    const demand = plan.demands.find((d: { kind: string; status: string }) => d.kind === 'ARRIVAL' && d.status === 'OPEN');
    const vehicle = plan.vehicles.find((v: { type: string }) => v.type === 'VAN');
    const driver = plan.persons.find((p: { id: string }) => p.id !== demand.personId);
    const arrival = demand.latestArrival;
    const departure = new Date(Date.parse(arrival) - 20 * 60_000).toISOString();
    const created = await req('POST', `/api/events/${eventId}/trips`, {
      vehicleId: vehicle.id,
      driverId: driver.id,
      stops: [
        { ref: 'a', locationId: demand.fromId, departure },
        { ref: 'b', locationId: demand.toId, arrival },
      ],
      passengers: [{ personId: demand.personId, fromRef: 'a', toRef: 'b', demandKey: demand.key }],
    });
    expect(created.status).toBe(200);
    const after = (await req('GET', `/api/events/${eventId}/plan`)).body;
    expect(after.demands.find((d: { key: string }) => d.key === demand.key).status).toBe('COVERED');
    // Driver has his own shift at that time → DRIVER_BUSY or none, but never LATE_ARRIVAL for this trip
    expect(after.conflicts.some((c: { code: string; tripId?: string }) => c.code === 'LATE_ARRIVAL' && c.tripId === created.body.id)).toBe(false);
  });

  it('validates input', async () => {
    const res = await req('POST', `/api/events/${eventId}/shifts/bulk`, { personIds: [], dates: [] });
    expect(res.status).toBe(400);
  });
});
