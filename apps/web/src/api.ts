import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import type { Conflict, Demand, PlanInput } from '@mb/shared';

export class ApiError extends Error {
  constructor(public status: number, public body: unknown) {
    super(`HTTP ${status}`);
  }
}

export async function api<T = unknown>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${url}`, {
    method,
    credentials: 'include',
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}

export interface Team {
  id: string;
  name: string;
  color: string;
  memberIds: string[];
}

export interface EventRow {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  defaultBufferMin: number;
  walkThresholdMin: number;
  selfEditLockHours: number;
}

export type Plan = PlanInput & { demands: Demand[]; conflicts: Conflict[] };

export const usePlan = (eventId?: string) =>
  useQuery({ queryKey: ['plan', eventId], queryFn: () => api<Plan>('GET', `/events/${eventId}/plan`), enabled: !!eventId });

export const useTeams = (eventId?: string) =>
  useQuery({ queryKey: ['teams', eventId], queryFn: () => api<Team[]>('GET', `/events/${eventId}/teams`), enabled: !!eventId });

export const useEvents = () => useQuery({ queryKey: ['events'], queryFn: () => api<EventRow[]>('GET', '/events') });

/** Mutation that refreshes all planning data afterwards and shows errors as toast. */
export function useApiMutation<V>(fn: (v: V) => Promise<unknown>, successMsg?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries();
      if (successMsg) notifications.show({ message: successMsg, color: 'green' });
    },
    onError: (e) =>
      notifications.show({
        color: 'red',
        title: 'Fehler',
        message: e instanceof ApiError ? JSON.stringify(e.body).slice(0, 300) : String(e),
      }),
  });
}
