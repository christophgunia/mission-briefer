import { ActionIcon, Badge, Button, Divider, Group, Modal, Select, Stack, Text, TextInput } from '@mantine/core';
import { IconArrowDown, IconArrowUp, IconPlus, IconTrash } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import type { Trip, TripInputT, TripStatus } from '@mb/shared';
import { api, useApiMutation, type Plan } from '../api';
import { conflictText, lookups, severityColor } from '../util';

export interface EditableTrip {
  id?: string;
  vehicleId: string;
  trailerId: string | null;
  driverId: string | null;
  status: TripStatus;
  note: string;
  stops: { ref: string; locationId: string; arrival: string; departure: string }[];
  passengers: { personId: string; fromRef: string; toRef: string; demandKey: string | null }[];
}

const toHHmm = (iso?: string | null) => (iso ? dayjs(iso).format('HH:mm') : '');

export function toEditable(trip: Trip): EditableTrip {
  const stops = [...trip.stops].sort((a, b) => a.order - b.order);
  return {
    id: trip.id,
    vehicleId: trip.vehicleId,
    trailerId: trip.trailerId ?? null,
    driverId: trip.driverId ?? null,
    status: trip.status,
    note: trip.note ?? '',
    stops: stops.map((s) => ({ ref: s.id, locationId: s.locationId, arrival: toHHmm(s.arrival), departure: toHHmm(s.departure) })),
    passengers: trip.passengers.map((p) => ({ personId: p.personId, fromRef: p.fromStopId, toRef: p.toStopId, demandKey: p.demandKey ?? null })),
  };
}

export function toInput(t: EditableTrip, day: string): TripInputT {
  // Times are HH:mm on the board day; a time earlier than the previous one rolls over to the next day.
  let last = 0;
  const abs = (hhmm: string) => {
    if (!hhmm) return null;
    let v = dayjs(`${day}T${hhmm}`);
    while (v.valueOf() < last) v = v.add(1, 'day');
    last = v.valueOf();
    return v.toISOString();
  };
  return {
    vehicleId: t.vehicleId,
    trailerId: t.trailerId,
    driverId: t.driverId,
    status: t.status,
    note: t.note || null,
    stops: t.stops.map((s) => {
      const arrival = abs(s.arrival);
      const departure = abs(s.departure);
      return { ref: s.ref, locationId: s.locationId, arrival, departure };
    }),
    passengers: t.passengers,
  };
}

export function saveTrip(eventId: string, t: EditableTrip, day: string) {
  const body = toInput(t, day);
  return t.id ? api('PUT', `/events/${eventId}/trips/${t.id}`, body) : api<{ id: string }>('POST', `/events/${eventId}/trips`, body);
}

interface Props {
  eventId: string;
  plan: Plan;
  day: string;
  trip: EditableTrip | null;
  onClose: () => void;
}

export function TripEditor({ eventId, plan, day, trip, onClose }: Props) {
  const { t } = useTranslation();
  const [e, setE] = useState<EditableTrip | null>(trip);
  useEffect(() => setE(trip), [trip]);
  const l = lookups(plan);
  const save = useApiMutation(async (x: EditableTrip) => {
    await saveTrip(eventId, x, day);
    onClose();
  }, t('common.saved'));
  const remove = useApiMutation(async (id: string) => {
    await api('DELETE', `/events/${eventId}/trips/${id}`);
    onClose();
  });

  if (!e) return null;
  const set = (patch: Partial<EditableTrip>) => setE({ ...e, ...patch });
  const setStop = (i: number, patch: Partial<EditableTrip['stops'][number]>) =>
    set({ stops: e.stops.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const moveStop = (i: number, d: -1 | 1) => {
    const stops = [...e.stops];
    const [s] = stops.splice(i, 1);
    stops.splice(i + d, 0, s!);
    set({ stops });
  };
  const vehicle = l.vehicleObj(e.vehicleId);
  const driverOpts = plan.persons.map((p) => ({ value: p.id, label: `${p.name} (${p.licenses.join(',') || '–'})` }));
  const locOpts = plan.locations.map((x) => ({ value: x.id, label: x.name }));
  const stopOpts = e.stops.map((s, i) => ({ value: s.ref, label: `${i + 1}. ${l.loc(s.locationId)}` }));
  const demandOf = new Map(plan.demands.map((d) => [d.key, d]));
  const conflicts = e.id ? plan.conflicts.filter((c) => c.tripId === e.id) : [];

  // Open demands on this day that start/end at one of the stops → quick add.
  const stopLocs = new Map(e.stops.map((s) => [s.locationId, s.ref]));
  const suggestions = plan.demands.filter(
    (d) => d.status === 'OPEN' && d.date === day && d.fromId && d.toId && stopLocs.has(d.fromId) && stopLocs.has(d.toId) &&
      e.stops.findIndex((s) => s.locationId === d.fromId) < e.stops.findIndex((s) => s.locationId === d.toId) &&
      !e.passengers.some((p) => p.demandKey === d.key),
  );

  return (
    <Modal opened onClose={onClose} title={e.id ? t('trip.title') : t('trip.new')} size="xl">
      <Stack>
        <Group grow>
          <Select label={t('trip.vehicle')} data={plan.vehicles.filter((v) => v.type !== 'TRAILER').map((v) => ({ value: v.id, label: v.name }))} value={e.vehicleId} onChange={(v) => v && set({ vehicleId: v })} />
          <Select label={t('trip.trailer')} clearable data={plan.vehicles.filter((v) => v.type === 'TRAILER').map((v) => ({ value: v.id, label: v.name }))} value={e.trailerId} onChange={(v) => set({ trailerId: v })} />
          <Select label={t('trip.driver')} searchable clearable data={driverOpts} value={e.driverId} onChange={(v) => set({ driverId: v })} />
          <Select label={t('trip.status')} data={(['PLANNED', 'CONFIRMED', 'ACTIVE', 'DONE', 'CANCELLED'] as const).map((s) => ({ value: s, label: t(`trip.statuses.${s}`) }))} value={e.status} onChange={(v) => v && set({ status: v as TripStatus })} />
        </Group>

        {conflicts.length > 0 && (
          <Stack gap={4}>
            {conflicts.map((c, i) => (
              <Badge key={i} color={severityColor[c.severity]} variant="light" style={{ textTransform: 'none' }}>
                {conflictText(c, t, l, demandOf)}
              </Badge>
            ))}
          </Stack>
        )}

        <Divider label={t('trip.stops')} labelPosition="left" />
        {e.stops.map((s, i) => (
          <Group key={s.ref} gap="xs" wrap="nowrap">
            <Text w={20} size="sm">{i + 1}.</Text>
            <Select style={{ flex: 1 }} size="xs" searchable data={locOpts} value={s.locationId} onChange={(v) => v && setStop(i, { locationId: v })} />
            <TextInput size="xs" type="time" w={100} disabled={i === 0} title={t('trip.arrival')} value={s.arrival} onChange={(x) => setStop(i, { arrival: x.currentTarget.value })} />
            <TextInput size="xs" type="time" w={100} disabled={i === e.stops.length - 1} title={t('trip.departure')} value={s.departure} onChange={(x) => setStop(i, { departure: x.currentTarget.value })} />
            <ActionIcon variant="subtle" disabled={i === 0} onClick={() => moveStop(i, -1)}><IconArrowUp size={14} /></ActionIcon>
            <ActionIcon variant="subtle" disabled={i === e.stops.length - 1} onClick={() => moveStop(i, 1)}><IconArrowDown size={14} /></ActionIcon>
            <ActionIcon variant="subtle" color="red" disabled={e.stops.length <= 2} onClick={() => set({ stops: e.stops.filter((_, j) => j !== i), passengers: e.passengers.filter((p) => p.fromRef !== s.ref && p.toRef !== s.ref) })}>
              <IconTrash size={14} />
            </ActionIcon>
          </Group>
        ))}
        <Group gap="xs">
          <Text size="xs" c="dimmed" w={20} />
          <Text size="xs" c="dimmed">{t('trip.arrival')} / {t('trip.departure')}</Text>
          <Button size="xs" variant="subtle" leftSection={<IconPlus size={14} />} onClick={() => set({ stops: [...e.stops, { ref: `n${Date.now()}`, locationId: e.stops[e.stops.length - 1]!.locationId, arrival: '', departure: '' }] })}>
            {t('trip.addStop')}
          </Button>
        </Group>

        <Divider label={`${t('trip.passengers')} (${e.passengers.length}/${vehicle?.seats ?? '?'})`} labelPosition="left" />
        {e.passengers.map((p, i) => {
          const d = p.demandKey ? demandOf.get(p.demandKey) : undefined;
          return (
            <Group key={i} gap="xs" wrap="nowrap">
              <Select style={{ flex: 1 }} size="xs" searchable data={plan.persons.map((x) => ({ value: x.id, label: x.name }))} value={p.personId} onChange={(v) => v && set({ passengers: e.passengers.map((q, j) => (j === i ? { ...q, personId: v } : q)) })} />
              <Select w={170} size="xs" data={stopOpts} value={p.fromRef} onChange={(v) => v && set({ passengers: e.passengers.map((q, j) => (j === i ? { ...q, fromRef: v } : q)) })} />
              <Select w={170} size="xs" data={stopOpts} value={p.toRef} onChange={(v) => v && set({ passengers: e.passengers.map((q, j) => (j === i ? { ...q, toRef: v } : q)) })} />
              <Badge variant="light" w={90}>{d ? t(`demand.kinds.${d.kind}`) : '–'}</Badge>
              <ActionIcon variant="subtle" color="red" onClick={() => set({ passengers: e.passengers.filter((_, j) => j !== i) })}><IconTrash size={14} /></ActionIcon>
            </Group>
          );
        })}
        {suggestions.length > 0 && (
          <Group gap={6}>
            {suggestions.slice(0, 20).map((d) => (
              <Button
                key={d.key}
                size="compact-xs"
                variant="light"
                leftSection={<IconPlus size={12} />}
                onClick={() => set({ passengers: [...e.passengers, { personId: d.personId, fromRef: stopLocs.get(d.fromId!)!, toRef: stopLocs.get(d.toId!)!, demandKey: d.key }] })}
              >
                {l.person(d.personId)}
              </Button>
            ))}
          </Group>
        )}

        <TextInput label={t('common.notes')} value={e.note} onChange={(x) => set({ note: x.currentTarget.value })} />
        <Group justify="space-between">
          {e.id ? <Button color="red" variant="subtle" onClick={() => confirm(t('common.confirmDelete')) && remove.mutate(e.id!)}>{t('common.delete')}</Button> : <span />}
          <Group>
            <Button variant="default" onClick={onClose}>{t('common.cancel')}</Button>
            <Button loading={save.isPending} onClick={() => save.mutate(e)}>{t('common.save')}</Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
