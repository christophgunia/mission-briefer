import { Text, Tooltip } from '@mantine/core';
import { useState } from 'react';
import dayjs from 'dayjs';
import { tripSpan, type Availability, type Trip, type Vehicle } from '@mb/shared';
import { fmtTime, type Lookups } from '../util';

const PX_PER_HOUR = 64;
const WIDTH = 24 * PX_PER_HOUR;

/** Colour by seat usage: green = free, yellow = partly, blue = full, red = over. */
export function loadColor(load: number, seats: number) {
  if (seats === 0) return 'var(--mantine-color-gray-6)';
  if (load > seats) return 'var(--mantine-color-red-7)';
  if (load === seats) return 'var(--mantine-color-blue-7)';
  if (load === 0) return 'var(--mantine-color-gray-6)';
  return load / seats >= 0.5 ? 'var(--mantine-color-teal-7)' : 'var(--mantine-color-green-6)';
}

export function maxLoad(trip: Trip) {
  const stops = [...trip.stops].sort((a, b) => a.order - b.order);
  const idx = new Map(stops.map((s, i) => [s.id, i]));
  let max = 0;
  for (let leg = 0; leg < stops.length - 1; leg++)
    max = Math.max(max, trip.passengers.filter((p) => idx.get(p.fromStopId)! <= leg && idx.get(p.toStopId)! > leg).length);
  return max;
}

interface Props {
  day: string;
  vehicles: Vehicle[];
  trips: Trip[];
  availabilities: Availability[];
  conflictTrips: Set<string>;
  l: Lookups;
  onTripClick?: (t: Trip) => void;
  onDrop?: (vehicleId: string, at: number, payload: string) => void;
}

export function Timeline({ day, vehicles, trips, availabilities, conflictTrips, l, onTripClick, onDrop }: Props) {
  const dayStart = dayjs(`${day}T00:00`).valueOf();
  const dayEnd = dayStart + 24 * 3600_000;
  const x = (t: number) => ((Math.min(Math.max(t, dayStart), dayEnd) - dayStart) / 3600_000) * PX_PER_HOUR;
  const [over, setOver] = useState<string | null>(null);

  return (
    <div className="timeline">
      <div className="tl-row" style={{ minHeight: 24 }}>
        <div className="tl-label" />
        <div className="tl-lane" style={{ width: WIDTH }}>
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="tl-hour" style={{ left: h * PX_PER_HOUR }}>{String(h).padStart(2, '0')}</div>
          ))}
        </div>
      </div>
      {[...vehicles].sort((a, b) => Number(a.type === 'TRAILER') - Number(b.type === 'TRAILER')).map((v) => {
        const vt = trips.filter((t) => t.vehicleId === v.id || t.trailerId === v.id);
        const av = availabilities.filter((a) => a.vehicleId === v.id);
        // Unavailable stretches = complement of availability windows within the day.
        const gaps: [number, number][] = [];
        if (av.length) {
          let cursor = dayStart;
          for (const a of [...av].sort((p, q) => Date.parse(p.from) - Date.parse(q.from))) {
            const f = Date.parse(a.from);
            if (f > cursor) gaps.push([cursor, Math.min(f, dayEnd)]);
            cursor = Math.max(cursor, Date.parse(a.to));
          }
          if (cursor < dayEnd) gaps.push([cursor, dayEnd]);
        }
        return (
          <div className="tl-row" key={v.id}>
            <div className="tl-label">
              <Text size="sm" fw={500} truncate>{v.name}</Text>
              <Text size="xs" c="dimmed">{v.seats} Pl. · {v.licenseRequired ?? ''}</Text>
            </div>
            <div
              className={`tl-lane ${over === v.id ? 'drop' : ''}`}
              style={{ width: WIDTH }}
              onDragOver={(e) => {
                if (!onDrop || v.type === 'TRAILER') return;
                e.preventDefault();
                setOver(v.id);
              }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                const rect = e.currentTarget.getBoundingClientRect();
                const at = dayStart + ((e.clientX - rect.left) / PX_PER_HOUR) * 3600_000;
                onDrop?.(v.id, at, e.dataTransfer.getData('text/plain'));
              }}
            >
              {Array.from({ length: 24 }, (_, h) => <div key={h} className="tl-hour" style={{ left: h * PX_PER_HOUR }} />)}
              {gaps.filter(([a, b]) => b > dayStart && a < dayEnd).map(([a, b], i) => (
                <div key={i} className="tl-unavail" style={{ left: x(a), width: x(b) - x(a) }} />
              ))}
              {vt.map((t) => {
                const span = tripSpan(t);
                if (!span || span.end < dayStart || span.start > dayEnd) return null;
                const load = maxLoad(t);
                const stops = [...t.stops].sort((a, b) => a.order - b.order);
                const isTrailer = t.trailerId === v.id;
                return (
                  <Tooltip
                    key={t.id}
                    multiline
                    w={260}
                    label={
                      <div>
                        <b>{fmtTime(stops[0]?.departure)}–{fmtTime(stops[stops.length - 1]?.arrival)}</b> · {l.person(t.driverId)}
                        {stops.map((s) => <div key={s.id}>{fmtTime(s.arrival ?? s.departure)} {l.loc(s.locationId)}</div>)}
                        <div>{t.passengers.map((p) => l.person(p.personId)).join(', ')}</div>
                      </div>
                    }
                  >
                    <div
                      className={`tl-trip ${conflictTrips.has(t.id) ? 'conflict' : ''}`}
                      style={{
                        left: x(span.start),
                        width: Math.max(x(span.end) - x(span.start), 18),
                        background: isTrailer ? 'var(--mantine-color-gray-5)' : loadColor(load, v.seats),
                      }}
                      onClick={() => onTripClick?.(t)}
                    >
                      {isTrailer ? '⛓' : `${load}/${v.seats}`} {l.loc(stops[stops.length - 1]?.locationId)}
                      <br />
                      {l.person(t.driverId)}
                    </div>
                  </Tooltip>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
