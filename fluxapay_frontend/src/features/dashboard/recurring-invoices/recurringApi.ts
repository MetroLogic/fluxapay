import { getToken } from '@/lib/auth';
import type { RecurringScheduleInput } from './schedule';

export interface RecurringSchedule extends RecurringScheduleInput {
  id: string;
  nextBillingDate?: string;
  status?: string;
}

const base = () => process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${base()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`,
      ...(init?.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.message ?? 'Request failed');
  return (body?.data ?? body) as T;
}

export const recurringApi = {
  create: (input: RecurringScheduleInput) =>
    request<RecurringSchedule>('/api/v1/invoices/recurring', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  listCustomers: () =>
    request<Array<{ id: string; name?: string; email: string }>>('/api/v1/customers').catch(() => []),
};
