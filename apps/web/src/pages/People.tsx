import { ActionIcon, Button, Group, Loader, Modal, MultiSelect, Select, Stack, Table, TagsInput, Text, TextInput, Textarea, Title } from '@mantine/core';
import { IconPlus, IconTrash, IconClipboard } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, useApiMutation, useTeams } from '../api';
import { TeamFilter, filterPersons } from '../components/TeamFilter';
import { prioColor } from '../util';
import type { Location } from '@mb/shared';

interface Row {
  id: string;
  personId: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  licenses: string[];
  prio: number;
  startLocationId: string | null;
  endLocationId: string | null;
  defaultLodgingId: string | null;
  teamIds: string[];
}

const LICENSES = ['B', 'BE', 'C1', 'C1E', 'C', 'CE'];

export function PeoplePage({ eventId }: { eventId: string }) {
  const { t } = useTranslation();
  const teams = useTeams(eventId);
  const locations = useQuery({ queryKey: ['locations'], queryFn: () => api<Location[]>('GET', '/locations') });
  const participants = useQuery({
    queryKey: ['participants', eventId],
    queryFn: () => api<(Omit<Row, 'id'> & { id: string })[]>('GET', `/events/${eventId}/participants`),
  });
  const [rows, setRows] = useState<Row[]>([]);
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [team, setTeam] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');

  useEffect(() => {
    if (participants.data) {
      setRows(participants.data.map((p) => ({ ...p, id: p.personId! })));
      setDirty(new Set());
    }
  }, [participants.data]);

  const save = useApiMutation(
    (list: Row[]) => api('PUT', `/events/${eventId}/participants`, list.map(({ id: _id, ...r }) => r)),
    t('common.saved'),
  );
  const remove = useApiMutation((personId: string) => api('DELETE', `/events/${eventId}/participants/${personId}`));

  const locOptions = useMemo(() => (locations.data ?? []).map((l) => ({ value: l.id, label: l.name })), [locations.data]);
  const lodgingOptions = useMemo(
    () => (locations.data ?? []).filter((l) => l.type === 'LODGING').map((l) => ({ value: l.id, label: l.name })),
    [locations.data],
  );
  const teamOptions = (teams.data ?? []).map((x) => ({ value: x.id, label: x.name }));

  if (!participants.data) return <Loader />;

  const update = (id: string, patch: Partial<Row>) => {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    setDirty((d) => new Set(d).add(id));
  };
  const addRow = () => {
    const id = `new-${Date.now()}`;
    setRows((rs) => [
      { id, personId: null, name: '', phone: null, email: null, licenses: [], prio: 5, startLocationId: null, endLocationId: null, defaultLodgingId: null, teamIds: team ? [team] : [] },
      ...rs,
    ]);
    setDirty((d) => new Set(d).add(id));
  };

  /** Parses tab-separated rows pasted from Excel: Name, Phone, Email, Licences, Prio, Team. */
  const doImport = () => {
    const teamByName = new Map((teams.data ?? []).map((x) => [x.name.toLowerCase(), x.id]));
    const lines = importText.replace(/\r/g, '').split('\n').filter((l) => l.trim());
    const parsed = lines
      .map((l) => l.split('\t').map((c) => c.trim()))
      .filter((c, i) => !(i === 0 && /^name$/i.test(c[0] ?? '')))
      .map(([name, phone, email, lic, prio, teamName]) => ({
        personId: null,
        name: name ?? '',
        phone: phone || null,
        email: email || null,
        licenses: (lic ?? '').split(/[,; ]+/).filter(Boolean).map((x) => x.toUpperCase()),
        prio: Number(prio) || 5,
        teamIds: teamName && teamByName.get(teamName.toLowerCase()) ? [teamByName.get(teamName.toLowerCase())!] : [],
      }))
      .filter((r) => r.name);
    save.mutate(parsed as unknown as Row[]);
    setImportOpen(false);
    setImportText('');
  };

  const visible = filterPersons(rows, teams.data ?? [], team, query).concat(rows.filter((r) => r.id.startsWith('new-') && !r.name));
  const unique = [...new Map(visible.map((r) => [r.id, r])).values()];

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={3}>{t('nav.people')} ({rows.length})</Title>
        <Group>
          <TeamFilter teams={teams.data ?? []} team={team} onTeam={setTeam} query={query} onQuery={setQuery} />
          <Button variant="default" leftSection={<IconClipboard size={16} />} onClick={() => setImportOpen(true)}>{t('person.import')}</Button>
          <Button variant="default" leftSection={<IconPlus size={16} />} onClick={addRow}>{t('person.add')}</Button>
          <Button disabled={!dirty.size} loading={save.isPending} onClick={() => save.mutate(rows.filter((r) => dirty.has(r.id) && r.name))}>
            {t('common.save')} {dirty.size ? `(${dirty.size})` : ''}
          </Button>
        </Group>
      </Group>

      <Table.ScrollContainer minWidth={1200} mah="calc(100vh - 180px)">
        <Table striped highlightOnHover stickyHeader verticalSpacing={4}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t('common.name')}</Table.Th>
              <Table.Th w={70}>{t('person.prio')}</Table.Th>
              <Table.Th>{t('person.teams')}</Table.Th>
              <Table.Th>{t('person.phone')}</Table.Th>
              <Table.Th>{t('person.licenses')}</Table.Th>
              <Table.Th>{t('person.start')}</Table.Th>
              <Table.Th>{t('person.lodging')}</Table.Th>
              <Table.Th>{t('person.end')}</Table.Th>
              <Table.Th w={40} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {unique.map((r) => (
              <Table.Tr key={r.id} bg={dirty.has(r.id) ? 'var(--mantine-color-yellow-light)' : undefined}>
                <Table.Td><TextInput size="xs" value={r.name} onChange={(e) => update(r.id, { name: e.currentTarget.value })} /></Table.Td>
                <Table.Td>
                  <Select
                    size="xs"
                    data={['1', '2', '3', '4', '5', '6', '7', '8', '9']}
                    value={String(r.prio)}
                    onChange={(v) => update(r.id, { prio: Number(v) })}
                    styles={{ input: { borderLeft: `4px solid var(--mantine-color-${prioColor(r.prio)}-filled)` } }}
                  />
                </Table.Td>
                <Table.Td><MultiSelect size="xs" data={teamOptions} value={r.teamIds} onChange={(v) => update(r.id, { teamIds: v })} /></Table.Td>
                <Table.Td><TextInput size="xs" value={r.phone ?? ''} onChange={(e) => update(r.id, { phone: e.currentTarget.value || null })} /></Table.Td>
                <Table.Td><TagsInput size="xs" data={LICENSES} value={r.licenses} onChange={(v) => update(r.id, { licenses: v.map((x) => x.toUpperCase()) })} /></Table.Td>
                <Table.Td><Select size="xs" searchable clearable data={locOptions} value={r.startLocationId} onChange={(v) => update(r.id, { startLocationId: v })} /></Table.Td>
                <Table.Td><Select size="xs" searchable clearable data={lodgingOptions} value={r.defaultLodgingId} onChange={(v) => update(r.id, { defaultLodgingId: v })} /></Table.Td>
                <Table.Td><Select size="xs" searchable clearable data={locOptions} value={r.endLocationId} onChange={(v) => update(r.id, { endLocationId: v })} /></Table.Td>
                <Table.Td>
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    onClick={() => {
                      if (r.personId) {
                        if (confirm(t('common.confirmDelete'))) remove.mutate(r.personId);
                      } else setRows((rs) => rs.filter((x) => x.id !== r.id));
                    }}
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>

      <Modal opened={importOpen} onClose={() => setImportOpen(false)} title={t('person.import')} size="lg">
        <Stack>
          <Text size="sm" c="dimmed">{t('person.importHelp')}</Text>
          <Textarea autosize minRows={8} value={importText} onChange={(e) => setImportText(e.currentTarget.value)} styles={{ input: { fontFamily: 'monospace' } }} />
          <Button onClick={doImport} disabled={!importText.trim()}>{t('common.apply')}</Button>
        </Stack>
      </Modal>
    </Stack>
  );
}
