import { Group, Loader, SegmentedControl, Stack, Text, Title } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Distance, Location, TransportKind } from '@mb/shared';
import { api, useApiMutation } from '../api';

/** Travel-time matrix (from × to). Editing a cell writes it; reverse direction is shown greyed as fallback. */
export function DistancesPage() {
  const { t } = useTranslation();
  const [kind, setKind] = useState<TransportKind>('VEHICLE');
  const locs = useQuery({ queryKey: ['locations'], queryFn: () => api<Location[]>('GET', '/locations') });
  const dist = useQuery({ queryKey: ['distances'], queryFn: () => api<Distance[]>('GET', '/distances') });
  const save = useApiMutation((e: { fromId: string; toId: string; minutes: number | null }) =>
    api('PUT', '/distances', { entries: [{ ...e, kind }] }),
  );

  if (!locs.data || !dist.data) return <Loader />;
  const m = new Map(dist.data.filter((d) => d.kind === kind).map((d) => [`${d.fromId}|${d.toId}`, d.minutes]));

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={3}>{t('distances.title')}</Title>
        <SegmentedControl
          value={kind}
          onChange={(v) => setKind(v as TransportKind)}
          data={(['VEHICLE', 'WALK', 'PUBLIC'] as const).map((k) => ({ value: k, label: t(`kinds.${k}`) }))}
        />
      </Group>
      <Text size="xs" c="dimmed">{t('distances.help')}</Text>
      <div className="matrix-wrap">
        <table className="matrix">
          <thead>
            <tr>
              <th style={{ left: 0, zIndex: 3 }}>{t('common.from')} \ {t('common.to')}</th>
              {locs.data.map((l) => <th key={l.id}>{l.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {locs.data.map((from) => (
              <tr key={from.id}>
                <th>{from.name}</th>
                {locs.data.map((to) => {
                  if (from.id === to.id) return <td key={to.id} className="muted">0</td>;
                  const own = m.get(`${from.id}|${to.id}`);
                  const rev = m.get(`${to.id}|${from.id}`);
                  return (
                    <td key={to.id} style={{ padding: 0 }}>
                      <input
                        key={`${own}`}
                        defaultValue={own ?? ''}
                        placeholder={rev !== undefined ? String(rev) : ''}
                        inputMode="numeric"
                        style={{ width: '100%', height: 30, border: 0, background: 'transparent', padding: '0 8px', color: 'inherit' }}
                        onBlur={(e) => {
                          const raw = e.currentTarget.value.trim();
                          const minutes = raw === '' ? null : Number(raw);
                          if ((minutes ?? undefined) === own || (minutes !== null && Number.isNaN(minutes))) return;
                          save.mutate({ fromId: from.id, toId: to.id, minutes });
                        }}
                        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Stack>
  );
}
