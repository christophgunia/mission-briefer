import { ActionIcon, Button, ColorInput, Group, Loader, Modal, NumberInput, Paper, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { IconPlus, IconTrash, IconUsersGroup } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api, useApiMutation, useEvents, useTeams, type EventRow } from '../api';

export function EventsPage() {
  const { t } = useTranslation();
  const events = useEvents();
  const [editing, setEditing] = useState<Partial<EventRow> | null>(null);
  const [teamsFor, setTeamsFor] = useState<string | null>(null);
  const save = useApiMutation(async (e: Partial<EventRow>) => {
    const { id, ...body } = e;
    if (id) await api('PUT', `/events/${id}`, body);
    else await api('POST', '/events', body);
    setEditing(null);
  }, t('common.saved'));

  if (!events.data) return <Loader />;
  const e = editing;

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={3}>{t('nav.events')}</Title>
        <Button leftSection={<IconPlus size={16} />} onClick={() => setEditing({ defaultBufferMin: 15, walkThresholdMin: 15, selfEditLockHours: 2 })}>
          {t('event.create')}
        </Button>
      </Group>
      <Table highlightOnHover>
        <Table.Tbody>
          {events.data.map((ev) => (
            <Table.Tr key={ev.id}>
              <Table.Td><Link to={`/e/${ev.id}/dashboard`}>{ev.name}</Link></Table.Td>
              <Table.Td>{ev.startDate} – {ev.endDate}</Table.Td>
              <Table.Td>
                <Group gap="xs" justify="flex-end">
                  <Button size="xs" variant="default" leftSection={<IconUsersGroup size={14} />} onClick={() => setTeamsFor(ev.id)}>{t('person.teams')}</Button>
                  <Button size="xs" variant="default" onClick={() => setEditing(ev)}>{t('common.edit')}</Button>
                </Group>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>

      <Modal opened={!!e} onClose={() => setEditing(null)} title={e?.id ? t('common.edit') : t('event.create')}>
        {e && (
          <Stack>
            <TextInput label={t('event.name')} value={e.name ?? ''} onChange={(x) => setEditing({ ...e, name: x.currentTarget.value })} />
            <Group grow>
              <TextInput type="date" label={t('event.start')} value={e.startDate ?? ''} onChange={(x) => setEditing({ ...e, startDate: x.currentTarget.value })} />
              <TextInput type="date" label={t('event.end')} value={e.endDate ?? ''} onChange={(x) => setEditing({ ...e, endDate: x.currentTarget.value })} />
            </Group>
            <NumberInput label={t('event.buffer')} min={0} value={e.defaultBufferMin} onChange={(v) => setEditing({ ...e, defaultBufferMin: Number(v) })} />
            <NumberInput label={t('event.walk')} min={0} value={e.walkThresholdMin} onChange={(v) => setEditing({ ...e, walkThresholdMin: Number(v) })} />
            <NumberInput label={t('event.lock')} min={0} value={e.selfEditLockHours} onChange={(v) => setEditing({ ...e, selfEditLockHours: Number(v) })} />
            <Button disabled={!e.name || !e.startDate || !e.endDate} onClick={() => save.mutate(e)}>{t('common.save')}</Button>
          </Stack>
        )}
      </Modal>

      <Modal opened={!!teamsFor} onClose={() => setTeamsFor(null)} title={t('person.teams')}>
        {teamsFor && <TeamsEditor eventId={teamsFor} />}
      </Modal>
    </Stack>
  );
}

function TeamsEditor({ eventId }: { eventId: string }) {
  const { t } = useTranslation();
  const teams = useTeams(eventId);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#228be6');
  const create = useApiMutation(async () => {
    await api('POST', `/events/${eventId}/teams`, { name, color });
    setName('');
  });
  const update = useApiMutation((v: { id: string; name?: string; color?: string }) => api('PUT', `/events/${eventId}/teams/${v.id}`, v));
  const remove = useApiMutation((id: string) => api('DELETE', `/events/${eventId}/teams/${id}`));
  return (
    <Stack>
      {teams.data?.map((tm) => (
        <Paper key={tm.id} withBorder p="xs">
          <Group gap="xs" wrap="nowrap">
            <ColorInput size="xs" w={120} value={tm.color} onChangeEnd={(c) => update.mutate({ id: tm.id, color: c })} />
            <TextInput size="xs" style={{ flex: 1 }} defaultValue={tm.name} onBlur={(e) => e.currentTarget.value !== tm.name && update.mutate({ id: tm.id, name: e.currentTarget.value })} />
            <Text size="xs" c="dimmed">{tm.memberIds.length}</Text>
            <ActionIcon variant="subtle" color="red" onClick={() => confirm(t('common.confirmDelete')) && remove.mutate(tm.id)}><IconTrash size={14} /></ActionIcon>
          </Group>
        </Paper>
      ))}
      <Group gap="xs" wrap="nowrap">
        <ColorInput size="xs" w={120} value={color} onChange={setColor} />
        <TextInput size="xs" style={{ flex: 1 }} placeholder={t('common.name')} value={name} onChange={(e) => setName(e.currentTarget.value)} />
        <ActionIcon disabled={!name} onClick={() => create.mutate(undefined)}><IconPlus size={14} /></ActionIcon>
      </Group>
    </Stack>
  );
}
