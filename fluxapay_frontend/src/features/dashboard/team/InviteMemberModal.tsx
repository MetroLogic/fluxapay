'use client';

import React, { useState } from 'react';
import { Modal } from '@/components/Modal';
import { Button } from '@/components/Button';
import { ROLES, ROLE_INFO, inviteSchema, type TeamRole } from './roles';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onInvite: (email: string, role: TeamRole) => Promise<void>;
}

export function InviteMemberModal({ isOpen, onClose, onInvite }: Props) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<TeamRole>('viewer');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = inviteSchema.safeParse({ email, role });
    if (!parsed.success) return setError(parsed.error.issues[0].message);
    setError('');
    setBusy(true);
    try {
      await onInvite(parsed.data.email, parsed.data.role);
      setEmail('');
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Invite Member">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <label className="block text-sm font-medium">
          Email address
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          {error && (
            <p role="alert" className="mt-1 text-xs text-red-600">
              {error}
            </p>
          )}
        </label>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Role</legend>
          {ROLES.map((r) => (
            <label key={r} title={ROLE_INFO[r].description} className="flex items-start gap-2 rounded-md border p-2 text-sm">
              <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} className="mt-1" />
              <span>
                <span className="font-medium">{ROLE_INFO[r].label}</span>
                <span className="block text-xs text-muted-foreground">{ROLE_INFO[r].description}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'Sending...' : 'Send invitation'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
