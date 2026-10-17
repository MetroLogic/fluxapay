'use client';

import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Modal } from '@/components/Modal';
import { Button } from '@/components/Button';
import {
  FREQUENCIES,
  FREQUENCY_LABELS,
  projectBillingDates,
  recurringScheduleSchema,
  type Frequency,
  type RecurringScheduleInput,
} from './schedule';
import { recurringApi, type RecurringSchedule } from './recurringApi';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  customers?: Array<{ id: string; name?: string; email: string }>;
  /** Called immediately with an optimistic row, then with the server result (or a rollback). */
  onCreated?: (schedule: RecurringSchedule, state: 'optimistic' | 'confirmed' | 'rolledBack') => void;
}

const today = () => new Date().toISOString().slice(0, 10);
const field = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm';

export function RecurringScheduleModal({ isOpen, onClose, customers: given, onCreated }: Props) {
  const [customers, setCustomers] = useState(given ?? []);
  const [customerId, setCustomerId] = useState('');
  const [frequency, setFrequency] = useState<Frequency>('monthly');
  const [startDate, setStartDate] = useState(today());
  const [endCondition, setEndCondition] = useState<RecurringScheduleInput['endCondition']>('never');
  const [endDate, setEndDate] = useState('');
  const [cycles, setCycles] = useState('');
  const [autoSendEmail, setAutoSendEmail] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (given || !isOpen) return;
    recurringApi.listCustomers().then(setCustomers);
  }, [given, isOpen]);

  const draft = {
    customerId,
    frequency,
    startDate,
    endCondition,
    endDate: endDate || undefined,
    cycles: cycles ? Number(cycles) : undefined,
    autoSendEmail,
  };
  const preview = useMemo(
    () => projectBillingDates(draft),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [frequency, startDate, endCondition, endDate, cycles],
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = recurringScheduleSchema.safeParse(draft);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[String(issue.path[0])] ??= issue.message;
      setErrors(next);
      return;
    }
    setErrors({});
    setSaving(true);
    const optimistic: RecurringSchedule = {
      ...parsed.data,
      id: `optimistic-${Date.now()}`,
      nextBillingDate: preview[0],
      status: 'pending',
    };
    onCreated?.(optimistic, 'optimistic');
    try {
      const created = await recurringApi.create(parsed.data);
      onCreated?.(created, 'confirmed');
      toast.success('Recurring schedule created');
      onClose();
    } catch (err) {
      onCreated?.(optimistic, 'rolledBack');
      toast.error(err instanceof Error ? err.message : 'Failed to create schedule');
    } finally {
      setSaving(false);
    }
  };

  const err = (k: string) =>
    errors[k] ? (
      <p role="alert" className="mt-1 text-xs text-red-600">
        {errors[k]}
      </p>
    ) : null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create Recurring Schedule">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <label className="block text-sm font-medium">
          Customer
          <select className={field} value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">Select a customer</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name ? `${c.name} (${c.email})` : c.email}
              </option>
            ))}
          </select>
          {err('customerId')}
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm font-medium">
            Billing cycle
            <select className={field} value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)}>
              {FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {FREQUENCY_LABELS[f]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium">
            Start date
            <input type="date" className={field} value={startDate} min={today()} onChange={(e) => setStartDate(e.target.value)} />
            {err('startDate')}
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm font-medium">
            Ends
            <select
              className={field}
              value={endCondition}
              onChange={(e) => setEndCondition(e.target.value as RecurringScheduleInput['endCondition'])}
            >
              <option value="never">Never</option>
              <option value="on_date">On date</option>
              <option value="after_cycles">After N cycles</option>
            </select>
          </label>
          {endCondition === 'on_date' && (
            <label className="block text-sm font-medium">
              End date
              <input type="date" className={field} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              {err('endDate')}
            </label>
          )}
          {endCondition === 'after_cycles' && (
            <label className="block text-sm font-medium">
              Number of cycles
              <input type="number" min={1} className={field} value={cycles} onChange={(e) => setCycles(e.target.value)} />
              {err('cycles')}
            </label>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={autoSendEmail} onChange={(e) => setAutoSendEmail(e.target.checked)} />
          Auto-send invoice email to customer upon cycle generation
        </label>
        <div className="rounded-lg border bg-muted/40 p-3" aria-label="Schedule summary">
          <p className="text-sm font-semibold">Next billing dates</p>
          {preview.length ? (
            <ol className="mt-1 list-decimal ps-5 text-sm text-muted-foreground">
              {preview.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ol>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">No billing dates to project yet.</p>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Save schedule'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
