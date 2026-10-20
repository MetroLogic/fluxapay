import { z } from 'zod';

export const ROLES = ['admin', 'developer', 'billing', 'viewer'] as const;
export type TeamRole = (typeof ROLES)[number];

export const ROLE_INFO: Record<TeamRole, { label: string; description: string }> = {
  admin: { label: 'Admin', description: 'Full access: manage settings, team members, API keys, payments and settlements.' },
  developer: { label: 'Developer', description: 'Manage API keys, webhooks and view payments. Cannot manage billing or team.' },
  billing: { label: 'Billing', description: 'Manage invoices, settlements and exports. Cannot manage API keys or team.' },
  viewer: { label: 'Viewer', description: 'Read-only access to dashboards and payments.' },
};

export type MemberStatus = 'Active' | 'Invited';

export interface TeamMember {
  id: string;
  name?: string;
  email: string;
  role: TeamRole;
  status: MemberStatus;
  createdAt: string;
}

export const inviteSchema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
  role: z.enum(ROLES),
});

export function paginate<T>(items: T[], page: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(Math.max(1, page), totalPages);
  return { items: items.slice((current - 1) * pageSize, current * pageSize), page: current, totalPages };
}
