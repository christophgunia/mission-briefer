import { Badge, Button, Checkbox, Group, Loader, Menu, Paper, Select, Stack, Text, TextInput, Title } from '@mantine/core';
import { IconCopy, IconTemplate, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { addDays, dateRange } from '@mb/shared';
import { api, useApiMutation, usePlan, useTeams } from '../api';
import { Matrix, cellKey, splitKey } from '../components/Matrix';
import { TeamFilter, filterPersons } from '../components/TeamFilter';
import { fmtDay, fmtTime } from '../util';

interface Form {
  start: string;
  end: string;
  locationId: string | null;
  note: string;
  replace: boolean;
}
interface Template extends Form {
  name: string;
}

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

const loadTemplates = (): Template[] => {
  try {
    return JSON.parse(localStorage.getItem('shiftTemplates') ?? '[]');
  } catch {
    return [];
  }
};

/** Groups selected cells to as few bulk calls as possible: same set of dates → one call. */
function groupSelection(cells: string[]) {
  const byPerson = new Map<string, string[]>();
  for (const k of cells) {
    const [p, d] = splitKey(k);
    byPerson.set(p, [...(byPerson.get(p) ?? []), d]);
  }
  const byDates = new Map<string, { personIds: string[]; dates: string[] }>();
  for (const [p, dates] of byPerson) {
    const key = dates.sort().join(',');
    const g = byDates.get(key) ?? { personIds: [], dates };
    g.personIds.push(p);
    byDates.set(key, g);
  }
  return [...byDates.values()];
}

export function ShiftsPage({ eventId }: { eventId: string }) {
  const { t, i18n } = useTranslation();
  const plan = usePlan(eventId);
  const teams = useTeams(eventId);
  const [team, setTeam] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [form, setForm] = useState<Form>({ start: '08:00', end: '16:00', locationId: null, note: '', replace: true });
  const [templates, setTemplates] = useState<Template[]>(loadTemplates);

  const bulk = useApiMutation(async (groups: { personIds: string[]; dates: string[]; f: Form }[]) => {
    let count = 0;
    for (const g of groups) {
      const res = await api<{ count: number }>('POST', `/events/${eventId}/shifts/bulk`, {
        personIds: g.personIds,
        dates: g.dates,
        start: g.f.start,
        end: g.f.end,
        locationId: g.f.locationId,
        note: g.f.note || null,
        teamId: team,
        replace: g.f.replace,
        timeZone: TZ,
      });
      count += res.count;
    }
    return count;
  }, t('common.saved'));
  const remove = useApiMutation(async (cells: string[]) => {
    for (const g of groupSelection(cells)) await api('POST', `/events/${eventId}/shifts/bulk-delete`, g);
  }, t('common.saved'));

  const data = plan.data;
  if (!data) return <Loader />;

  const days = dateRange(data.event.startDate, data.event.endDate);
  const persons = filterPersons(data.persons, teams.data ?? [], team, query);
  const teamColor = new Map((teams.data ?? []).map((x) => [x.id, x.color]));
  const locName = new Map(data.locations.map((l) => [l.id, l.name]));
  const shiftsByCell = new Map<string, typeof data.shifts>();
  for (const s of data.shifts) {
    const k = cellKey(s.personId, s.date);
    shiftsByCell.set(k, [...(shiftsByCell.get(k) ?? []), s]);
  }

  const setForSelection = (cells: string[]) => {
    if (!form.locationId || !cells.length) return;
    bulk.mutate(groupSelection(cells).map((g) => ({ ...g, f: form })));
  };
  const wholeTeam = () => setForSelection(persons.flatMap((p) => days.map((d) => cellKey(p.id, d))));

  /** Copies the previous day's shifts (same times/place) into each selected cell. */
  const copyPrevDay = () => {
    const groups = new Map<string, { personIds: Set<string>; dates: Set<string>; f: Form }>();
    for (const k of sel) {
      const [p, d] = splitKey(k);
      for (const s of shiftsByCell.get(cellKey(p, addDays(d, -1))) ?? []) {
        const f: Form = { start: fmtTime(s.start), end: fmtTime(s.end), locationId: s.locationId, note: s.note ?? '', replace: true };
        const sig = `${f.start}|${f.end}|${f.locationId}|${d}`;
        const g = groups.get(sig) ?? { personIds: new Set(), dates: new Set([d]), f };
        g.personIds.add(p);
        groups.set(sig, g);
      }
    }
    bulk.mutate([...groups.values()].map((g) => ({ personIds: [...g.personIds], dates: [...g.dates], f: g.f })));
  };

  const saveTemplate = () => {
    const name = `${form.start}–${form.end} ${locName.get(form.locationId ?? '') ?? ''}`.trim();
    const next = [...templates.filter((x) => x.name !== name), { ...form, name }];
    setTemplates(next);
    try {
      localStorage.setItem('shiftTemplates', JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={3}>{t('shifts.title')}</Title>
        <Group>
          <TeamFilter teams={teams.data ?? []} team={team} onTeam={setTeam} query={query} onQuery={setQuery} />
        </Group>
      </Group>

      <Paper withBorder p="sm">
        <Group align="flex-end" gap="sm">
          <TextInput type="time" label={t('shifts.start')} value={form.start} onChange={(e) => setForm({ ...form, start: e.currentTarget.value })} w={110} />
          <TextInput type="time" label={t('shifts.end')} value={form.end} onChange={(e) => setForm({ ...form, end: e.currentTarget.value })} w={110} />
          <Select
            label={t('common.location')}
            w={220}
            searchable
            data={data.locations.filter((l) => l.type !== 'LODGING').map((l) => ({ value: l.id, label: l.name }))}
            value={form.locationId}
            onChange={(v) => setForm({ ...form, locationId: v })}
          />
          <TextInput label={t('common.notes')} w={180} value={form.note} onChange={(e) => setForm({ ...form, note: e.currentTarget.value })} />
          <Menu>
            <Menu.Target>
              <Button variant="default" leftSection={<IconTemplate size={16} />}>{t('shifts.templates')}</Button>
            </Menu.Target>
            <Menu.Dropdown>
              {templates.map((tp) => (
                <Menu.Item key={tp.name} onClick={() => setForm({ ...tp })}>{tp.name}</Menu.Item>
              ))}
              <Menu.Divider />
              <Menu.Item onClick={saveTemplate} disabled={!form.locationId}>{t('shifts.saveTemplate')}</Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
        <Group mt="sm" gap="sm">
          <Checkbox label={t('shifts.replace')} checked={form.replace} onChange={(e) => setForm({ ...form, replace: e.currentTarget.checked })} />
        </Group>
        <Group mt="sm" gap="sm">
          <Button disabled={!sel.size || !form.locationId} loading={bulk.isPending} onClick={() => setForSelection([...sel])}>
            {t('shifts.setForSelection')} ({sel.size})
          </Button>
          {team && (
            <Button variant="light" disabled={!form.locationId} onClick={wholeTeam}>
              {t('shifts.wholeTeam')}
            </Button>
          )}
          <Button variant="default" leftSection={<IconCopy size={16} />} disabled={!sel.size} onClick={copyPrevDay}>
            {t('shifts.copyPrevDay')}
          </Button>
          <Button variant="default" color="red" leftSection={<IconTrash size={16} />} disabled={!sel.size} onClick={() => remove.mutate([...sel])}>
            {t('shifts.deleteSelection')}
          </Button>
        </Group>
      </Paper>
      <Text size="xs" c="dimmed">{t('shifts.selectHelp')}</Text>

      <Matrix
        rows={persons.map((p) => ({ id: p.id, label: p.name }))}
        cols={days.map((d) => ({ id: d, label: fmtDay(d, i18n.language) }))}
        selection={sel}
        onSelectionChange={setSel}
        onClear={(cells) => remove.mutate(cells)}
        corner={t('common.name')}
        cell={(pid, day) => {
          const list = shiftsByCell.get(cellKey(pid, day)) ?? [];
          if (!list.length) return { content: '', muted: true };
          return {
            title: list.map((s) => s.note).filter(Boolean).join(' · '),
            content: (
              <Stack gap={2}>
                {list.map((s) => (
                  <Group key={s.id} gap={4} wrap="nowrap">
                    <Badge size="xs" color={teamColor.get(s.teamId ?? '') ?? 'gray'} variant="filled" circle> </Badge>
                    <Text size="xs">
                      {fmtTime(s.start)}–{fmtTime(s.end)} {locName.get(s.locationId)}
                    </Text>
                  </Group>
                ))}
              </Stack>
            ),
          };
        }}
      />
    </Stack>
  );
}
