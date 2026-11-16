import { Badge, Button, Checkbox, Group, Loader, Menu, Paper, ScrollArea, SegmentedControl, Stack, Switch, Text, Title, Tooltip } from '@mantine/core';
import { IconWalk, IconBus, IconCar, IconDots, IconPlus, IconPrinter } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { dateRange, proposeTripForDemand, tripSpan, type Demand, type Trip } from '@mb/shared';
import { api, useApiMutation, usePlan, type Plan } from '../api';
import { Timeline } from '../components/Timeline';
import { TripEditor, toEditable, type EditableTrip } from '../components/TripEditor';
import { conflictText, fmtDay, fmtTime, localDate, lookups, prioColor, severityColor } from '../util';

const hhmm = (iso?: string | null) => (iso ? fmtTime(iso) : '');

/** Builds an editable trip for one or more demands, optionally merged into an existing trip. */
function buildTrip(plan: Plan, vehicleId: string, demands: Demand[], existing?: Trip): EditableTrip | null {
  const first = demands[0];
  if (!first) return null;
  let trip: EditableTrip;
  if (existing) trip = toEditable(existing);
  else {
    const proposal = proposeTripForDemand(first, plan.distances);
    if (!proposal) return null;
    trip = {
      vehicleId, trailerId: null, driverId: null, status: 'PLANNED', note: '', passengers: [],
      stops: proposal.stops.map((s, i) => ({ ref: `n${i}`, locationId: s.locationId, arrival: hhmm(s.arrival), departure: hhmm(s.departure) })),
    };
  }
  for (const d of demands) {
    if (!d.fromId || !d.toId) continue;
    let fromIdx = trip.stops.findIndex((s) => s.locationId === d.fromId);
    if (fromIdx < 0) {
      // New pickup: insert before the first stop that is a destination.
      trip.stops.splice(0, 0, { ref: `n${Math.random()}`, locationId: d.fromId, arrival: '', departure: '' });
      fromIdx = 0;
    }
    let toIdx = trip.stops.findIndex((s, i) => i > fromIdx && s.locationId === d.toId);
    if (toIdx < 0) {
      trip.stops.push({ ref: `n${Math.random()}`, locationId: d.toId, arrival: '', departure: '' });
      toIdx = trip.stops.length - 1;
    }
    if (!trip.passengers.some((p) => p.demandKey === d.key))
      trip.passengers.push({ personId: d.personId, fromRef: trip.stops[fromIdx]!.ref, toRef: trip.stops[toIdx]!.ref, demandKey: d.key });
  }
  // Make sure first stop has departure and last has arrival.
  trip.stops = trip.stops.map((s, i, all) => ({
    ...s,
    arrival: i === 0 ? '' : s.arrival,
    departure: i === all.length - 1 ? '' : s.departure,
  }));
  return trip;
}

export function BoardPage({ eventId }: { eventId: string }) {
  const { t, i18n } = useTranslation();
  const plan = usePlan(eventId);
  const [dayState, setDay] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const [editing, setEditing] = useState<{ trip: EditableTrip; day: string } | null>(null);
  const override = useApiMutation((v: { demandKey: string; kind: string | null }) => api('PUT', `/events/${eventId}/overrides`, v));

  const data = plan.data;
  const days = useMemo(() => (data ? dateRange(data.event.startDate, data.event.endDate) : []), [data]);
  if (!data) return <Loader />;
  const day = dayState ?? days[0]!;
  const l = lookups(data);
  const demandOf = new Map(data.demands.map((d) => [d.key, d]));

  const dayDemands = data.demands.filter((d) => d.date === day && (showAll || d.status === 'OPEN' || d.status === 'INVALID'));
  const dayTrips = data.trips.filter((tr) => {
    const s = tripSpan(tr);
    return s && (localDate(new Date(s.start).toISOString()) === day || localDate(new Date(s.end).toISOString()) === day);
  });
  const dayConflicts = data.conflicts.filter((c) => !c.time || localDate(c.time) === day);
  const conflictTrips = new Set(dayConflicts.filter((c) => c.severity === 'ERROR' && c.tripId).map((c) => c.tripId!));
  const openCount = (d: string) => data.demands.filter((x) => x.date === d && (x.status === 'OPEN' || x.status === 'INVALID')).length;

  const openTrip = (tr: Trip) => {
    const s = tripSpan(tr);
    setEditing({ trip: toEditable(tr), day: s ? localDate(new Date(s.start).toISOString()) : day });
  };

  const onDrop = (vehicleId: string, at: number, payload: string) => {
    const keys = payload.split(',').filter(Boolean);
    const demands = keys.map((k) => demandOf.get(k)).filter((d): d is Demand => !!d);
    const existing = data.trips.find((tr) => {
      const s = tripSpan(tr);
      return tr.vehicleId === vehicleId && s && at >= s.start - 10 * 60_000 && at <= s.end + 10 * 60_000;
    });
    const trip = buildTrip(data, vehicleId, demands, existing);
    if (trip) setEditing({ trip, day });
    setChecked(new Set());
  };

  const kindIcon = { WALK: IconWalk, PUBLIC: IconBus, TAXI: IconCar, OTHER: IconCar } as const;

  return (
    <Stack gap="sm">
      <Group justify="space-between">
        <Title order={3}>{t('nav.board')}</Title>
        <Group>
          <SegmentedControl
            value={day}
            onChange={setDay}
            data={days.map((d) => ({
              value: d,
              label: (
                <Group gap={4} wrap="nowrap">
                  {fmtDay(d, i18n.language)}
                  {openCount(d) > 0 && <Badge size="xs" color="red" circle>{openCount(d)}</Badge>}
                </Group>
              ),
            }))}
          />
          <Button variant="default" leftSection={<IconPrinter size={16} />} component={Link} to={`/e/${eventId}/print?day=${day}`} target="_blank">
            {t('trip.print')}
          </Button>
        </Group>
      </Group>

      <Group align="flex-start" wrap="nowrap" gap="sm">
        {/* ---- Demands ---- */}
        <Paper withBorder p="xs" w={320} style={{ flex: 'none' }}>
          <Group justify="space-between" mb={6}>
            <Text fw={600} size="sm">{t('demand.open')} ({dayDemands.filter((d) => d.status === 'OPEN').length})</Text>
            <Switch size="xs" label={t('demand.showAll')} checked={showAll} onChange={(e) => setShowAll(e.currentTarget.checked)} />
          </Group>
          <Text size="xs" c="dimmed" mb={6}>{t('demand.dragHint')}</Text>
          <ScrollArea h="calc(100vh - 230px)">
            <Stack gap={6}>
              {dayDemands.map((d) => {
                const Icon = d.status === 'WALK' ? IconWalk : d.status === 'ALTERNATIVE' ? IconBus : null;
                return (
                  <Paper
                    key={d.key}
                    withBorder
                    p={6}
                    className="demand-card"
                    draggable={d.status === 'OPEN'}
                    onDragStart={(e) => {
                      const keys = checked.has(d.key) ? [...checked] : [d.key];
                      e.dataTransfer.setData('text/plain', keys.join(','));
                    }}
                    style={{ borderLeft: `4px solid var(--mantine-color-${prioColor(d.prio)}-filled)`, opacity: d.status === 'OPEN' || d.status === 'INVALID' ? 1 : 0.55 }}
                  >
                    <Group justify="space-between" wrap="nowrap" gap={4}>
                      <Group gap={6} wrap="nowrap">
                        {d.status === 'OPEN' && (
                          <Checkbox size="xs" checked={checked.has(d.key)} onChange={(e) => {
                            const s = new Set(checked);
                            if (e.currentTarget.checked) s.add(d.key); else s.delete(d.key);
                            setChecked(s);
                          }} />
                        )}
                        <Text size="sm" fw={500} truncate maw={150}>{l.person(d.personId)}</Text>
                      </Group>
                      <Group gap={4} wrap="nowrap">
                        {Icon && <Icon size={14} />}
                        <Badge size="xs" variant="light" color={d.status === 'INVALID' ? 'red' : 'blue'}>{t(`demand.kinds.${d.kind}`)}</Badge>
                        <Menu position="bottom-end" withinPortal>
                          <Menu.Target><IconDots size={14} style={{ cursor: 'pointer' }} /></Menu.Target>
                          <Menu.Dropdown>
                            {(['WALK', 'PUBLIC', 'TAXI', 'OTHER'] as const).map((k) => {
                              const KI = kindIcon[k];
                              return (
                                <Menu.Item key={k} leftSection={<KI size={14} />} onClick={() => override.mutate({ demandKey: d.key, kind: k })}>
                                  {t(`kinds.${k}`)}
                                </Menu.Item>
                              );
                            })}
                            {d.status === 'ALTERNATIVE' || d.status === 'WALK' ? (
                              <Menu.Item color="red" onClick={() => override.mutate({ demandKey: d.key, kind: null })}>{t('common.clear')}</Menu.Item>
                            ) : null}
                          </Menu.Dropdown>
                        </Menu>
                      </Group>
                    </Group>
                    <Text size="xs" c="dimmed">
                      {l.loc(d.fromId)} → {l.loc(d.toId)}
                    </Text>
                    <Text size="xs">
                      {d.earliestDeparture && t('demand.after', { time: fmtTime(d.earliestDeparture) })}{' '}
                      {d.latestArrival && <b>{t('demand.by', { time: fmtTime(d.latestArrival) })}</b>}
                    </Text>
                  </Paper>
                );
              })}
            </Stack>
          </ScrollArea>
        </Paper>

        {/* ---- Timeline + conflicts ---- */}
        <Stack style={{ flex: 1, minWidth: 0 }} gap="sm">
          <Group justify="flex-end">
            <Button size="xs" variant="default" leftSection={<IconPlus size={14} />} onClick={() => {
              const v = data.vehicles.find((x) => x.type !== 'TRAILER');
              const loc = data.locations[0];
              if (v && loc) setEditing({ day, trip: { vehicleId: v.id, trailerId: null, driverId: null, status: 'PLANNED', note: '', passengers: [], stops: [
                { ref: 'a', locationId: v.depotLocationId ?? loc.id, arrival: '', departure: '08:00' },
                { ref: 'b', locationId: loc.id, arrival: '08:30', departure: '' },
              ] } });
            }}>{t('trip.new')}</Button>
          </Group>
          <Timeline
            day={day}
            vehicles={data.vehicles}
            trips={dayTrips}
            availabilities={data.availabilities}
            conflictTrips={conflictTrips}
            l={l}
            onTripClick={openTrip}
            onDrop={onDrop}
          />
          <Paper withBorder p="xs">
            <Text fw={600} size="sm" mb={6}>{t('conflicts.title')} ({dayConflicts.filter((c) => c.code !== 'UNCOVERED').length})</Text>
            <ScrollArea.Autosize mah={220}>
              <Stack gap={4}>
                {dayConflicts.filter((c) => c.code !== 'UNCOVERED').length === 0 && <Text size="sm" c="dimmed">{t('conflicts.none')}</Text>}
                {dayConflicts.filter((c) => c.code !== 'UNCOVERED').map((c, i) => (
                  <Group key={i} gap="xs" wrap="nowrap" style={{ cursor: c.tripId ? 'pointer' : undefined }} onClick={() => {
                    const tr = c.tripId && data.trips.find((x) => x.id === c.tripId);
                    if (tr) openTrip(tr);
                  }}>
                    <Badge size="xs" color={severityColor[c.severity]}>{c.severity === 'ERROR' ? '!' : 'i'}</Badge>
                    <Text size="xs" w={40}>{fmtTime(c.time)}</Text>
                    <Tooltip label={c.code}><Text size="sm">{conflictText(c, t, l, demandOf)}</Text></Tooltip>
                  </Group>
                ))}
              </Stack>
            </ScrollArea.Autosize>
          </Paper>
        </Stack>
      </Group>

      {editing && <TripEditor eventId={eventId} plan={data} day={editing.day} trip={editing.trip} onClose={() => setEditing(null)} />}
    </Stack>
  );
}
