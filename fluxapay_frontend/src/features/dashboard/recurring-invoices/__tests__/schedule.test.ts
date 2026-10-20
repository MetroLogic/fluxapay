import { addCycles, projectBillingDates, recurringScheduleSchema } from '../schedule';

describe('schedule utilities', () => {
  it('clamps monthly dates to month end', () => {
    expect(addCycles('2025-01-31', 'monthly', 1)).toBe('2025-02-28');
    expect(addCycles('2025-01-01', 'biweekly', 1)).toBe('2025-01-15');
  });

  it('projects 3 dates and honours cycle limits', () => {
    const base = { frequency: 'weekly' as const, startDate: '2025-01-01', endCondition: 'never' as const };
    expect(projectBillingDates(base)).toHaveLength(3);
    expect(projectBillingDates({ ...base, endCondition: 'after_cycles', cycles: 2 })).toHaveLength(2);
    expect(projectBillingDates({ ...base, endCondition: 'on_date', endDate: '2025-01-08' })).toEqual([
      '2025-01-01',
      '2025-01-08',
    ]);
  });

  it('rejects non-positive cycles and bad dates', () => {
    const ok = { customerId: 'c', frequency: 'monthly', startDate: '2025-01-01', endCondition: 'after_cycles', cycles: 0, autoSendEmail: true };
    expect(recurringScheduleSchema.safeParse(ok).success).toBe(false);
    expect(recurringScheduleSchema.safeParse({ ...ok, cycles: 3, startDate: 'nope' }).success).toBe(false);
    expect(recurringScheduleSchema.safeParse({ ...ok, cycles: 3 }).success).toBe(true);
  });
});
