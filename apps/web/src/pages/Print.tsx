import { Button, Group, Loader, Stack, Table, Text, Title } from '@mantine/core';
import { useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { tripSpan } from '@mb/shared';
import { usePlan } from '../api';
import { fmtDay, fmtTime, localDate, lookups } from '../util';

/** Printable schedule per vehicle for one day (fallback without phone). */
export function PrintPage() {
  const { eventId } = useParams();
  const [params] = useSearchParams();
  const { t, i18n } = useTranslation();
  const plan = usePlan(eventId);
  const data = plan.data;
  if (!data) return <Loader />;
  const day = params.get('day') ?? data.event.startDate;
  const l = lookups(data);
  const trips = data.trips
    .filter((tr) => tr.status !== 'CANCELLED')
    .map((tr) => ({ tr, span: tripSpan(tr) }))
    .filter((x) => x.span && localDate(new Date(x.span.start).toISOString()) === day)
    .sort((a, b) => a.span!.start - b.span!.start);

  return (
    <Stack p="lg" maw={900} mx="auto">
      <Group justify="space-between" className="no-print">
        <Text c="dimmed">{data.event.name}</Text>
        <Button onClick={() => window.print()}>{t('common.print')}</Button>
      </Group>
      {data.vehicles.map((v) => {
        const vt = trips.filter((x) => x.tr.vehicleId === v.id);
        if (!vt.length) return null;
        return (
          <Stack key={v.id} gap="xs" style={{ breakAfter: 'page' }}>
            <Title order={3}>{v.name} – {fmtDay(day, i18n.language)}</Title>
            {vt.map(({ tr }) => {
              const stops = [...tr.stops].sort((a, b) => a.order - b.order);
              return (
                <Stack key={tr.id} gap={4} mb="md">
                  <Text fw={600}>{t('trip.driver')}: {l.person(tr.driverId)} {l.personObj(tr.driverId ?? '')?.phone ?? ''}</Text>
                  <Table withTableBorder withColumnBorders>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th w={70}>{t('trip.arrival')}</Table.Th>
                        <Table.Th w={70}>{t('trip.departure')}</Table.Th>
                        <Table.Th>{t('common.location')}</Table.Th>
                        <Table.Th>↑</Table.Th>
                        <Table.Th>↓</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {stops.map((s) => (
                        <Table.Tr key={s.id}>
                          <Table.Td>{fmtTime(s.arrival)}</Table.Td>
                          <Table.Td>{fmtTime(s.departure)}</Table.Td>
                          <Table.Td>{l.loc(s.locationId)}</Table.Td>
                          <Table.Td>
                            {tr.passengers.filter((p) => p.fromStopId === s.id).map((p) => (
                              <div key={p.id}>{l.person(p.personId)} <Text span size="xs" c="dimmed">{l.personObj(p.personId)?.phone}</Text></div>
                            ))}
                          </Table.Td>
                          <Table.Td>{tr.passengers.filter((p) => p.toStopId === s.id).map((p) => <div key={p.id}>{l.person(p.personId)}</div>)}</Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                  {tr.note && <Text size="sm">{tr.note}</Text>}
                </Stack>
              );
            })}
          </Stack>
        );
      })}
    </Stack>
  );
}
