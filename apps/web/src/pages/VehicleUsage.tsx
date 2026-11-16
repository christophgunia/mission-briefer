import { Group, Loader, Stack, Text, Title } from '@mantine/core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { dateRange, tripSpan, type Trip } from '@mb/shared';
import { usePlan } from '../api';
import { Timeline, loadColor } from '../components/Timeline';
import { TripEditor, toEditable, type EditableTrip } from '../components/TripEditor';
import { fmtDay, localDate, lookups } from '../util';

/** Read-mostly overview: all days stacked, one timeline per day. */
export function VehicleUsagePage({ eventId }: { eventId: string }) {
  const { t, i18n } = useTranslation();
  const plan = usePlan(eventId);
  const [editing, setEditing] = useState<{ trip: EditableTrip; day: string } | null>(null);
  const data = plan.data;
  if (!data) return <Loader />;
  const l = lookups(data);
  const days = dateRange(data.event.startDate, data.event.endDate);
  const conflictTrips = new Set(data.conflicts.filter((c) => c.severity === 'ERROR' && c.tripId).map((c) => c.tripId!));
  const open = (tr: Trip) => {
    const s = tripSpan(tr);
    setEditing({ trip: toEditable(tr), day: s ? localDate(new Date(s.start).toISOString()) : days[0]! });
  };

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={3}>{t('nav.vehicles')}</Title>
        <Group gap="md">
          {[[0, 8, 'leer'], [3, 8, '< 50 %'], [5, 8, '≥ 50 %'], [8, 8, 'voll'], [9, 8, 'überbucht']].map(([a, b, label]) => (
            <Group key={String(label)} gap={4}>
              <div style={{ width: 14, height: 14, borderRadius: 3, background: loadColor(a as number, b as number) }} />
              <Text size="xs">{label}</Text>
            </Group>
          ))}
        </Group>
      </Group>
      {days.map((d) => (
        <Stack key={d} gap={4}>
          <Text fw={600}>{fmtDay(d, i18n.language)}</Text>
          <Timeline
            day={d}
            vehicles={data.vehicles}
            trips={data.trips}
            availabilities={data.availabilities}
            conflictTrips={conflictTrips}
            l={l}
            onTripClick={open}
          />
        </Stack>
      ))}
      {editing && <TripEditor eventId={eventId} plan={data} day={editing.day} trip={editing.trip} onClose={() => setEditing(null)} />}
    </Stack>
  );
}
