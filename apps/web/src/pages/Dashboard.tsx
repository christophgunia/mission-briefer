import { Badge, Card, Group, Loader, RingProgress, SimpleGrid, Stack, Table, Text, Title, Tooltip } from '@mantine/core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { dateRange, tripSpan } from '@mb/shared';
import { usePlan, useTeams } from '../api';
import { maxLoad } from '../components/Timeline';
import { TeamFilter, filterPersons } from '../components/TeamFilter';
import { fmtDay, fmtTime, localDate, lookups } from '../util';

const statusColor = { OPEN: 'red', INVALID: 'red', COVERED: 'green', WALK: 'teal', ALTERNATIVE: 'cyan' } as const;

export function DashboardPage({ eventId }: { eventId: string }) {
  const { t, i18n } = useTranslation();
  const plan = usePlan(eventId);
  const teams = useTeams(eventId);
  const [team, setTeam] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const data = plan.data;
  if (!data) return <Loader />;
  const l = lookups(data);
  const days = dateRange(data.event.startDate, data.event.endDate);

  const stats = days.map((day) => {
    const dem = data.demands.filter((d) => d.date === day);
    const open = dem.filter((d) => d.status === 'OPEN' || d.status === 'INVALID').length;
    const conf = data.conflicts.filter((c) => c.code !== 'UNCOVERED' && c.time && localDate(c.time) === day);
    const trips = data.trips.filter((tr) => {
      const s = tripSpan(tr);
      return s && localDate(new Date(s.start).toISOString()) === day;
    });
    let seats = 0;
    let used = 0;
    for (const tr of trips) {
      seats += l.vehicleObj(tr.vehicleId)?.seats ?? 0;
      used += maxLoad(tr);
    }
    return {
      day, total: dem.length, open, errors: conf.filter((c) => c.severity === 'ERROR').length,
      warnings: conf.filter((c) => c.severity === 'WARNING').length, vehicles: new Set(trips.map((x) => x.vehicleId)).size,
      usage: seats ? Math.round((used / seats) * 100) : 0,
    };
  });

  const persons = filterPersons(data.persons, teams.data ?? [], team, query);

  return (
    <Stack>
      <Title order={3}>{data.event.name}</Title>
      <SimpleGrid cols={{ base: 1, sm: 2, lg: Math.min(days.length, 4) }}>
        {stats.map((s) => {
          const color = s.open || s.errors ? 'red' : s.warnings ? 'orange' : 'green';
          return (
            <Card key={s.day} withBorder component={Link} to={`/e/${eventId}/board`} style={{ borderTop: `4px solid var(--mantine-color-${color}-filled)` }}>
              <Group justify="space-between">
                <Text fw={600}>{fmtDay(s.day, i18n.language)}</Text>
                <RingProgress size={56} thickness={6} sections={[{ value: s.total ? ((s.total - s.open) / s.total) * 100 : 100, color }]} label={<Text size="xs" ta="center">{s.total - s.open}/{s.total}</Text>} />
              </Group>
              <SimpleGrid cols={2} spacing={4} mt="xs">
                <Text size="sm">{t('dashboard.open')}: <b style={{ color: s.open ? 'var(--mantine-color-red-filled)' : undefined }}>{s.open}</b></Text>
                <Text size="sm">{t('dashboard.errors')}: <b>{s.errors}</b></Text>
                <Text size="sm">{t('dashboard.warnings')}: <b>{s.warnings}</b></Text>
                <Text size="sm">{t('dashboard.vehiclesUsed')}: <b>{s.vehicles}/{data.vehicles.filter((v) => v.type !== 'TRAILER').length}</b></Text>
                <Text size="sm">{t('dashboard.seatsUsed')}: <b>{s.usage}%</b></Text>
              </SimpleGrid>
            </Card>
          );
        })}
      </SimpleGrid>

      <Group justify="space-between" mt="md">
        <Title order={4}>{t('dashboard.personDay')}</Title>
        <Group><TeamFilter teams={teams.data ?? []} team={team} onTeam={setTeam} query={query} onQuery={setQuery} /></Group>
      </Group>
      <Table.ScrollContainer minWidth={800}>
        <Table striped verticalSpacing={4} stickyHeader>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t('common.name')}</Table.Th>
              {days.map((d) => <Table.Th key={d}>{fmtDay(d, i18n.language)}</Table.Th>)}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {persons.map((p) => (
              <Table.Tr key={p.id}>
                <Table.Td><Text size="sm" fw={500}>{p.name}</Text></Table.Td>
                {days.map((d) => {
                  const shifts = data.shifts.filter((s) => s.personId === p.id && s.date === d);
                  const dem = data.demands.filter((x) => x.personId === p.id && x.date === d);
                  return (
                    <Table.Td key={d}>
                      {shifts.length ? (
                        <Text size="xs">{shifts.map((s) => `${fmtTime(s.start)}–${fmtTime(s.end)} ${l.loc(s.locationId)}`).join(', ')}</Text>
                      ) : (
                        <Text size="xs" c="dimmed">{t('dashboard.noShift')}</Text>
                      )}
                      <Group gap={3} mt={2}>
                        {dem.map((x) => (
                          <Tooltip key={x.key} label={`${l.loc(x.fromId)} → ${l.loc(x.toId)} · ${t(`demand.status.${x.status}`)}`}>
                            <Badge size="xs" variant="light" color={statusColor[x.status as keyof typeof statusColor] ?? 'gray'}>
                              {t(`demand.kinds.${x.kind}`)}
                            </Badge>
                          </Tooltip>
                        ))}
                      </Group>
                    </Table.Td>
                  );
                })}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </Stack>
  );
}
