'use client';

import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { UserPlus } from 'lucide-react';
import { Button } from '@/components/Button';
import { Modal } from '@/components/Modal';
import { InviteMemberModal } from './InviteMemberModal';
import { ROLES, ROLE_INFO, paginate, type TeamMember, type TeamRole } from './roles';
import { teamApi } from './teamApi';

const PAGE_SIZE = 10;

function StatusBadge({ status }: { status: TeamMember['status'] }) {
  const cls = status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800';
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{status}</span>;
}

export function TeamMembersPanel() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [toRemove, setToRemove] = useState<TeamMember | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setMembers(await teamApi.list());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load team');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (action: () => Promise<unknown>, ok: string) => {
    try {
      await action();
      toast.success(ok);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    }
  };

  const view = paginate(members, page, PAGE_SIZE);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Team Members</h2>
          <p className="text-sm text-muted-foreground">Invite collaborators and manage their access.</p>
        </div>
        <Button className="gap-2" onClick={() => setInviteOpen(true)}>
          <UserPlus className="h-4 w-4" />
          Invite Member
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-start">
            <tr>
              {['Name', 'Email', 'Role', 'Status', 'Date added', ''].map((h) => (
                <th key={h} className="px-4 py-2 text-start font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-6 text-center">Loading...</td></tr>
            ) : view.items.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">No team members yet.</td></tr>
            ) : (
              view.items.map((m) => (
                <tr key={m.id} className="border-t">
                  <td className="px-4 py-2">{m.name ?? '-'}</td>
                  <td className="px-4 py-2">{m.email}</td>
                  <td className="px-4 py-2" title={ROLE_INFO[m.role].description}>{ROLE_INFO[m.role].label}</td>
                  <td className="px-4 py-2"><StatusBadge status={m.status} /></td>
                  <td className="px-4 py-2">{new Date(m.createdAt).toLocaleDateString()}</td>
                  <td className="relative px-4 py-2 text-end">
                    <button
                      type="button"
                      aria-label={`Actions for ${m.email}`}
                      className="rounded px-2 py-1 hover:bg-muted"
                      onClick={() => setMenuFor(menuFor === m.id ? null : m.id)}
                    >
                      ...
                    </button>
                    {menuFor === m.id && (
                      <div role="menu" className="absolute end-4 z-10 mt-1 w-52 rounded-md border bg-background p-1 text-start shadow-lg">
                        <p className="px-2 py-1 text-xs text-muted-foreground">Change role</p>
                        {ROLES.filter((r) => r !== m.role).map((r: TeamRole) => (
                          <button
                            key={r}
                            role="menuitem"
                            title={ROLE_INFO[r].description}
                            className="block w-full rounded px-2 py-1 text-start hover:bg-muted"
                            onClick={() => { setMenuFor(null); void run(() => teamApi.changeRole(m.id, r), `Role changed to ${ROLE_INFO[r].label}`); }}
                          >
                            {ROLE_INFO[r].label}
                          </button>
                        ))}
                        {m.status === 'Invited' && (
                          <button
                            role="menuitem"
                            className="block w-full rounded px-2 py-1 text-start hover:bg-muted"
                            onClick={() => { setMenuFor(null); void run(() => teamApi.resend(m.id), 'Invitation resent'); }}
                          >
                            Resend invitation
                          </button>
                        )}
                        <button
                          role="menuitem"
                          className="block w-full rounded px-2 py-1 text-start text-red-600 hover:bg-muted"
                          onClick={() => { setMenuFor(null); setToRemove(m); }}
                        >
                          Remove access
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {view.totalPages > 1 && (
        <div className="flex items-center justify-end gap-3 text-sm">
          <Button variant="outline" disabled={view.page <= 1} onClick={() => setPage(view.page - 1)}>Previous</Button>
          <span>Page {view.page} of {view.totalPages}</span>
          <Button variant="outline" disabled={view.page >= view.totalPages} onClick={() => setPage(view.page + 1)}>Next</Button>
        </div>
      )}

      <InviteMemberModal
        isOpen={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onInvite={async (email, role) => {
          try {
            await teamApi.invite(email, role);
            toast.success(`Invitation sent to ${email}`);
            await load();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Failed to send invitation');
            throw e;
          }
        }}
      />

      <Modal isOpen={!!toRemove} onClose={() => setToRemove(null)} title="Remove team member">
        <p className="text-sm">
          Remove <strong>{toRemove?.email}</strong>? They will immediately lose access to this account.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setToRemove(null)}>Cancel</Button>
          <Button
            variant="destructive"
            onClick={() => {
              const m = toRemove;
              setToRemove(null);
              if (m) void run(() => teamApi.remove(m.id), 'Member removed');
            }}
          >
            Remove
          </Button>
        </div>
      </Modal>
    </section>
  );
}
