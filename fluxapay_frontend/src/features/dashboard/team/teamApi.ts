import { getToken } from '@/lib/auth';
import type { TeamMember, TeamRole } from './roles';

const base = () => process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${base()}/api/v1/merchants/team${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.message ?? 'Team request failed');
  return (body?.data ?? body) as T;
}

export const teamApi = {
  list: () => request<TeamMember[]>('/members'),
  invite: (email: string, role: TeamRole) =>
    request<TeamMember>('/invitations', { method: 'POST', body: JSON.stringify({ email, role }) }),
  changeRole: (id: string, role: TeamRole) =>
    request<TeamMember>(`/members/${id}`, { method: 'PATCH', body: JSON.stringify({ role }) }),
  resend: (id: string) => request<void>(`/invitations/${id}/resend`, { method: 'POST' }),
  remove: (id: string) => request<void>(`/members/${id}`, { method: 'DELETE' }),
};
