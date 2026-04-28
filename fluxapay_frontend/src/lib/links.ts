export type PaymentLink = {
  id: string;
  slug: string;
  label: string;
  amount: number;
  currency: string;
  created_at: string;
  clicks: number;
  conversions: number;
  active: boolean;
};

const store: PaymentLink[] = [];

function randomSlug(): string {
  return Math.random().toString(36).slice(2, 8);
}

export const getLinks = (): PaymentLink[] => store;

export function createLink(label: string, amount: number, currency = "USD"): PaymentLink {
  const link: PaymentLink = {
    id: crypto.randomUUID(),
    slug: randomSlug(),
    label,
    amount,
    currency,
    created_at: new Date().toISOString(),
    clicks: 0,
    conversions: 0,
    active: true,
  };
  store.push(link);
  return link;
}

export function findBySlug(slug: string): PaymentLink | undefined {
  return store.find((l) => l.slug === slug);
}

export function incrementClicks(slug: string): PaymentLink | null {
  const link = findBySlug(slug);
  if (!link) return null;
  link.clicks++;
  return link;
}

export function incrementConversions(slug: string): PaymentLink | null {
  const link = findBySlug(slug);
  if (!link) return null;
  link.conversions++;
  return link;
}

export function deleteLink(id: string): boolean {
  const idx = store.findIndex((l) => l.id === id);
  if (idx === -1) return false;
  store.splice(idx, 1);
  return true;
}

export function toggleActive(id: string): PaymentLink | null {
  const link = store.find((l) => l.id === id);
  if (!link) return null;
  link.active = !link.active;
  return link;
}
