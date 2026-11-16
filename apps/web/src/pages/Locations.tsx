import { ActionIcon, Button, Group, Loader, NumberInput, Select, Stack, Table, TextInput, Title } from '@mantine/core';
import { IconDeviceFloppy, IconPlus, IconTrash } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Location, LocationType } from '@mb/shared';
import { api, useApiMutation } from '../api';

const TYPES: LocationType[] = ['LODGING', 'VENUE', 'DEPOT', 'STATION', 'OTHER'];

export function LocationsPage() {
  const { t } = useTranslation();
  const q = useQuery({ queryKey: ['locations'], queryFn: () => api<Location[]>('GET', '/locations') });
  const [edits, setEdits] = useState<Record<string, Partial<Location>>>({});
  const [draft, setDraft] = useState<Partial<Location>>({ type: 'VENUE' });

  const save = useApiMutation(async () => {
    for (const [id, patch] of Object.entries(edits)) await api('PUT', `/locations/${id}`, patch);
    setEdits({});
  }, t('common.saved'));
  const create = useApiMutation(async () => {
    await api('POST', '/locations', draft);
    setDraft({ type: draft.type });
  });
  const remove = useApiMutation((id: string) => api('DELETE', `/locations/${id}`));

  if (!q.data) return <Loader />;
  const val = <K extends keyof Location>(l: Location, k: K) => (edits[l.id]?.[k] ?? l[k]) as Location[K];
  const set = (id: string, patch: Partial<Location>) => setEdits((e) => ({ ...e, [id]: { ...e[id], ...patch } }));
  const typeData = TYPES.map((x) => ({ value: x, label: t(`location.types.${x}`) }));

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={3}>{t('nav.locations')}</Title>
        <Button leftSection={<IconDeviceFloppy size={16} />} disabled={!Object.keys(edits).length} onClick={() => save.mutate(undefined)}>
          {t('common.save')}
        </Button>
      </Group>
      <Table striped verticalSpacing={4}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>{t('common.name')}</Table.Th>
            <Table.Th w={160}>{t('location.type')}</Table.Th>
            <Table.Th>{t('location.address')}</Table.Th>
            <Table.Th w={110}>{t('location.buffer')}</Table.Th>
            <Table.Th w={40} />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          <Table.Tr>
            <Table.Td><TextInput size="xs" placeholder={t('common.name')} value={draft.name ?? ''} onChange={(e) => setDraft({ ...draft, name: e.currentTarget.value })} /></Table.Td>
            <Table.Td><Select size="xs" data={typeData} value={draft.type} onChange={(v) => setDraft({ ...draft, type: v as LocationType })} /></Table.Td>
            <Table.Td><TextInput size="xs" value={draft.address ?? ''} onChange={(e) => setDraft({ ...draft, address: e.currentTarget.value })} /></Table.Td>
            <Table.Td><NumberInput size="xs" min={0} value={draft.bufferMin ?? ''} onChange={(v) => setDraft({ ...draft, bufferMin: v === '' ? null : Number(v) })} /></Table.Td>
            <Table.Td><ActionIcon disabled={!draft.name} onClick={() => create.mutate(undefined)}><IconPlus size={16} /></ActionIcon></Table.Td>
          </Table.Tr>
          {q.data.map((l) => (
            <Table.Tr key={l.id} bg={edits[l.id] ? 'var(--mantine-color-yellow-light)' : undefined}>
              <Table.Td><TextInput size="xs" value={val(l, 'name')} onChange={(e) => set(l.id, { name: e.currentTarget.value })} /></Table.Td>
              <Table.Td><Select size="xs" data={typeData} value={val(l, 'type')} onChange={(v) => set(l.id, { type: v as LocationType })} /></Table.Td>
              <Table.Td><TextInput size="xs" value={val(l, 'address') ?? ''} onChange={(e) => set(l.id, { address: e.currentTarget.value })} /></Table.Td>
              <Table.Td><NumberInput size="xs" min={0} value={val(l, 'bufferMin') ?? ''} onChange={(v) => set(l.id, { bufferMin: v === '' ? null : Number(v) })} /></Table.Td>
              <Table.Td>
                <ActionIcon variant="subtle" color="red" onClick={() => confirm(t('common.confirmDelete')) && remove.mutate(l.id)}>
                  <IconTrash size={16} />
                </ActionIcon>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}
