import { inviteSchema, paginate } from '../roles';

describe('team roles helpers', () => {
  it('validates invites', () => {
    expect(inviteSchema.safeParse({ email: 'a@b.co', role: 'admin' }).success).toBe(true);
    expect(inviteSchema.safeParse({ email: 'nope', role: 'admin' }).success).toBe(false);
    expect(inviteSchema.safeParse({ email: 'a@b.co', role: 'owner' }).success).toBe(false);
  });

  it('paginates and clamps pages', () => {
    const items = Array.from({ length: 25 }, (_, i) => i);
    expect(paginate(items, 3, 10).items).toHaveLength(5);
    expect(paginate(items, 99, 10).page).toBe(3);
    expect(paginate([], 1, 10).totalPages).toBe(1);
  });
});
