import { Button, Group, Loader, Select, Stack, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { addDays, dateRange } from '@mb/shared';
import { api, useApiMutation, usePlan, useTeams } from '../api';
import { Matrix, cellKey, splitKey } from '../components/Matrix';
import { TeamFilter, filterPersons } from '../components/TeamFilter';
import { fmtDay } from '../util';

type Entry = { personId: string; night: string; locationId: string | null };

export function LodgingPage({ eventId }: { eventId: string }) {
  const { t, i18n } = useTranslation();
  const plan = usePlan(eventId);
  const teams = useTeams(eventId);
  const [team, setTeam] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const save = useApiMutation((entries: Entry[]) => api('PUT', `/events/${eventId}/lodgings`, { entries }), t('common.saved'));

  const data = plan.data;
  const lodgingLocs = useMemo(
    () => (data?.locations ?? []).filter((l) => l.type === 'LODGING').concat((data?.locations ?? []).filter((l) => l.type !== 'LODGING')),
    [data],
  );
  if (!data) return <Loader />;

  // Nights: from the night before the event (early arrivals) to the second-to-last day.
  const nights = dateRange(addDays(data.event.startDate, -1), addDays(data.event.endDate, -1));
  const persons = filterPersons(data.persons, teams.data ?? [], team, query);
  const explicit = new Map(data.lodgings.map((l) => [cellKey(l.personId, l.night), l.locationId]));
  const defaults = new Map(data.participations.map((p) => [p.personId, p.defaultLodgingId]));
  const locName = new Map(data.locations.map((l) => [l.id, l.name]));
  const byName = new Map(data.locations.map((l) => [l.name.trim().toLowerCase(), l.id]));

  const apply = (locationId: string | null) => {
    if (!sel.size) return;
    save.mutate([...sel].map((k) => {
      const [personId, night] = splitKey(k);
      return { personId, night, locationId };
    }));
  };

  const paste = (anchor: { row: number; col: number }, values: string[][]) => {
    const entries: Entry[] = [];
    for (const [ri, line] of values.entries())
      for (const [ci, raw] of (line ?? []).entries()) {
        if (raw === undefined) continue;
        const person = persons[anchor.row + ri];
        const night = nights[anchor.col + ci];
        if (!person || !night) continue;
        const name = raw.trim().toLowerCase();
        const locationId = name ? byName.get(name) : null;
        if (locationId === undefined) {
          notifications.show({ color: 'red', message: t('lodging.unknown', { name: raw }) });
          return;
        }
        entries.push({ personId: person.id, night, locationId });
      }
    if (entries.length) save.mutate(entries);
  };

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={3}>{t('lodging.title')}</Title>
        <Group>
          <TeamFilter teams={teams.data ?? []} team={team} onTeam={setTeam} query={query} onQuery={setQuery} />
        </Group>
      </Group>
      <Group>
        <Text size="sm" c="dimmed">{t('common.selected', { count: sel.size })}</Text>
        <Select
          w={260}
          placeholder={t('lodging.setFor')}
          searchable
          data={lodgingLocs.map((l) => ({ value: l.id, label: l.name }))}
          value={null}
          onChange={(v) => v && apply(v)}
          disabled={!sel.size}
        />
        <Button variant="default" disabled={!sel.size} onClick={() => apply(null)}>
          {t('lodging.default')}
        </Button>
      </Group>
      <Text size="xs" c="dimmed">{t('lodging.help')}</Text>
      <Matrix
        rows={persons.map((p) => ({ id: p.id, label: p.name }))}
        cols={nights.map((n) => ({ id: n, label: `${fmtDay(n, i18n.language)} → ${fmtDay(addDays(n, 1), i18n.language)}` }))}
        selection={sel}
        onSelectionChange={setSel}
        onClear={(cells) => save.mutate(cells.map((k) => ({ personId: splitKey(k)[0], night: splitKey(k)[1], locationId: null })))}
        onPaste={paste}
        corner={t('person.lodging')}
        cell={(pid, night) => {
          const ex = explicit.get(cellKey(pid, night));
          if (ex) return { content: locName.get(ex) };
          const def = defaults.get(pid);
          return { content: def ? locName.get(def) : '–', muted: true };
        }}
      />
    </Stack>
  );
}
