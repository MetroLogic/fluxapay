import { z } from 'zod';

export const FREQUENCIES = ['weekly', 'biweekly', 'monthly', 'annually'] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  weekly: 'Weekly',
  biweekly: 'Bi-weekly',
  monthly: 'Monthly',
  annually: 'Annually',
};

export const recurringScheduleSchema = z
  .object({
    customerId: z.string().min(1, 'Select a customer'),
    frequency: z.enum(FREQUENCIES),
    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid start date')
      .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), 'Enter a valid start date'),
    endCondition: z.enum(['never', 'on_date', 'after_cycles']),
    endDate: z.string().optional(),
    cycles: z.number().int('Cycles must be a whole number').positive('Cycles must be positive').optional(),
    autoSendEmail: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.endCondition === 'on_date') {
      if (!v.endDate || Number.isNaN(Date.parse(`${v.endDate}T00:00:00Z`))) {
        ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'Enter a valid end date' });
      } else if (v.endDate < v.startDate) {
        ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'End date must be after start date' });
      }
    }
    if (v.endCondition === 'after_cycles' && v.cycles === undefined) {
      ctx.addIssue({ code: 'custom', path: ['cycles'], message: 'Cycles must be a positive number' });
    }
  });

export type RecurringScheduleInput = z.infer<typeof recurringScheduleSchema>;

function parse(d: string): Date {
  return new Date(`${d}T00:00:00Z`);
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Adds n cycles to a date; monthly/annual steps clamp to the end of shorter months. */
export function addCycles(start: string, frequency: Frequency, n: number): string {
  const base = parse(start);
  if (frequency === 'weekly' || frequency === 'biweekly') {
    base.setUTCDate(base.getUTCDate() + n * (frequency === 'weekly' ? 7 : 14));
    return fmt(base);
  }
  const months = n * (frequency === 'monthly' ? 1 : 12);
  const day = base.getUTCDate();
  const target = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return fmt(target);
}

/** Projects upcoming billing dates (default 3), honouring the end condition. */
export function projectBillingDates(
  input: Pick<RecurringScheduleInput, 'frequency' | 'startDate' | 'endCondition' | 'endDate' | 'cycles'>,
  count = 3,
): string[] {
  if (Number.isNaN(Date.parse(`${input.startDate}T00:00:00Z`))) return [];
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    if (input.endCondition === 'after_cycles' && input.cycles !== undefined && i >= input.cycles) break;
    const d = addCycles(input.startDate, input.frequency, i);
    if (input.endCondition === 'on_date' && input.endDate && d > input.endDate) break;
    out.push(d);
  }
  return out;
}
