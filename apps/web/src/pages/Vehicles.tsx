import { ActionIcon, Button, Checkbox, Group, Loader, Modal, NumberInput, Select, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { IconPlus, IconTrash, IconCalendar } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import type { Location, Vehicle, VehicleType } from '@mb/shared';
import { api, useApiMutation } from '../api';

type V = Vehicle & { plate?: string | null; availabilities: { from: string; to: string }[] };
const TYPES: VehicleType[] = ['CAR', 'VAN', 'TRUCK', 'TRAILER'];
const LICENSES = ['B', 'BE', 'C1', 'C1E', 'C', 'CE'];
const toLocal = (iso: string) => dayjs(iso).format('YYYY-MM-DDTHH:mm');

export function VehiclesPage() {
  const { t } = useTranslation();
  const q = useQuery({ queryKey: ['vehicles'], queryFn: () => api<V[]>('GET', '/vehicles') });
  const locs = useQuery({ queryKey: ['locations'], queryFn: () => api<Location[]>('GET', '/locations') });
  const [editing, setEditing] = useState<Partial<V> | null>(null);

  const save = useApiMutation(async (v: Partial<V>) => {
    const { id, ...body } = v;
    const payload = { ...body, availabilities: (body.availabilities ?? []).map((a) => ({ from: dayjs(a.from).toISOString(), to: dayjs(a.to).toISOString() })) };
    if (id) await api('PUT', `/vehicles/${id}`, payload);
    else await api('POST', '/vehicles', payload);
    setEditing(null);
  }, t('common.saved'));
  const remove = useApiMutation((id: string) => api('DELETE', `/vehicles/${id}`));

  if (!q.data) return <Loader />;
  const locName = new Map((locs.data ?? []).map((l) => [l.id, l.name]));
  const e = editing;

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={3}>{t('nav.masterVehicles')} ({q.data.length})</Title>
        <Button leftSection={<IconPlus size={16} />} onClick={() => setEditing({ type: 'VAN', seats: 8, hasHitch: false, licenseRequired: 'B', availabilities: [] })}>
          {t('common.add')}
        </Button>
      </Group>
      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>{t('common.name')}</Table.Th>
            <Table.Th>{t('vehicle.type')}</Table.Th>
            <Table.Th>{t('vehicle.seats')}</Table.Th>
            <Table.Th>{t('vehicle.license')}</Table.Th>
            <Table.Th>{t('vehicle.hitch')}</Table.Th>
            <Table.Th>{t('vehicle.depot')}</Table.Th>
            <Table.Th>{t('vehicle.availability')}</Table.Th>
            <Table.Th w={40} />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {q.data.map((v) => (
            <Table.Tr key={v.id} style={{ cursor: 'pointer' }} onClick={() => setEditing({ ...v, availabilities: v.availabilities.map((a) => ({ from: toLocal(a.from), to: toLocal(a.to) })) })}>
              <Table.Td>{v.name}{v.plate ? <Text span c="dimmed" size="xs"> · {v.plate}</Text> : null}</Table.Td>
              <Table.Td>{t(`vehicle.types.${v.type}`)}</Table.Td>
              <Table.Td>{v.seats}</Table.Td>
              <Table.Td>{v.licenseRequired}</Table.Td>
              <Table.Td>{v.hasHitch ? '✓' : ''}</Table.Td>
              <Table.Td>{locName.get(v.depotLocationId ?? '') ?? '–'}</Table.Td>
              <Table.Td>
                <Text size="xs">
                  {v.availabilities.length
                    ? v.availabilities.map((a) => `${dayjs(a.from).format('DD.MM. HH:mm')}–${dayjs(a.to).format('DD.MM. HH:mm')}`).join(', ')
                    : t('vehicle.alwaysAvailable')}
                </Text>
              </Table.Td>
              <Table.Td onClick={(ev) => ev.stopPropagation()}>
                <ActionIcon variant="subtle" color="red" onClick={() => confirm(t('common.confirmDelete')) && remove.mutate(v.id)}>
                  <IconTrash size={16} />
                </ActionIcon>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>

      <Modal opened={!!e} onClose={() => setEditing(null)} title={e?.id ? t('common.edit') : t('common.add')}>
        {e && (
          <Stack>
            <TextInput label={t('common.name')} value={e.name ?? ''} onChange={(x) => setEditing({ ...e, name: x.currentTarget.value })} data-autofocus />
            <TextInput label={t('vehicle.plate')} value={e.plate ?? ''} onChange={(x) => setEditing({ ...e, plate: x.currentTarget.value })} />
            <Group grow>
              <Select label={t('vehicle.type')} data={TYPES.map((x) => ({ value: x, label: t(`vehicle.types.${x}`) }))} value={e.type} onChange={(v) => setEditing({ ...e, type: v as VehicleType, seats: v === 'TRAILER' ? 0 : e.seats })} />
              <NumberInput label={t('vehicle.seats')} min={0} value={e.seats} onChange={(v) => setEditing({ ...e, seats: Number(v) })} />
            </Group>
            <Group grow>
              <Select label={t('vehicle.license')} data={LICENSES} clearable value={e.licenseRequired ?? null} onChange={(v) => setEditing({ ...e, licenseRequired: v })} />
              <Select label={t('vehicle.depot')} clearable searchable data={(locs.data ?? []).map((l) => ({ value: l.id, label: l.name }))} value={e.depotLocationId ?? null} onChange={(v) => setEditing({ ...e, depotLocationId: v })} />
            </Group>
            <Checkbox label={t('vehicle.hitch')} checked={e.hasHitch ?? false} onChange={(x) => setEditing({ ...e, hasHitch: x.currentTarget.checked })} />
            <Text fw={500} size="sm">{t('vehicle.availability')}</Text>
            {(e.availabilities ?? []).map((a, i) => (
              <Group key={i} gap="xs" wrap="nowrap">
                <TextInput type="datetime-local" size="xs" value={a.from} onChange={(x) => setEditing({ ...e, availabilities: e.availabilities!.map((y, j) => (j === i ? { ...y, from: x.currentTarget.value } : y)) })} />
                <TextInput type="datetime-local" size="xs" value={a.to} onChange={(x) => setEditing({ ...e, availabilities: e.availabilities!.map((y, j) => (j === i ? { ...y, to: x.currentTarget.value } : y)) })} />
                <ActionIcon variant="subtle" color="red" onClick={() => setEditing({ ...e, availabilities: e.availabilities!.filter((_, j) => j !== i) })}><IconTrash size={14} /></ActionIcon>
              </Group>
            ))}
            <Button variant="default" size="xs" leftSection={<IconCalendar size={14} />} onClick={() => setEditing({ ...e, availabilities: [...(e.availabilities ?? []), { from: dayjs().format('YYYY-MM-DDT06:00'), to: dayjs().format('YYYY-MM-DDT22:00') }] })}>
              {t('vehicle.addAvailability')}
            </Button>
            <Button onClick={() => save.mutate(e)} disabled={!e.name}>{t('common.save')}</Button>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
