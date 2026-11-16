import { Select, TextInput } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { Team } from '../api';

/** Team dropdown + name search used above all person-based tables. */
export function TeamFilter(props: {
  teams: Team[];
  team: string | null;
  onTeam: (v: string | null) => void;
  query: string;
  onQuery: (v: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <Select
        w={200}
        placeholder={t('shifts.allPersons')}
        clearable
        data={props.teams.map((x) => ({ value: x.id, label: x.name }))}
        value={props.team}
        onChange={props.onTeam}
      />
      <TextInput w={200} placeholder={t('common.search')} value={props.query} onChange={(e) => props.onQuery(e.currentTarget.value)} />
    </>
  );
}

export function filterPersons<T extends { id: string; name: string }>(persons: T[], teams: Team[], team: string | null, query: string) {
  const members = team ? new Set(teams.find((x) => x.id === team)?.memberIds) : null;
  const q = query.trim().toLowerCase();
  return persons.filter((p) => (!members || members.has(p.id)) && (!q || p.name.toLowerCase().includes(q)));
}
