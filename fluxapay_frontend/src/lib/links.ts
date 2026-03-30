export type PaymentLink = {
  id: string;
  slug: string;
  label: string;
  amount: number;
  currency: string;
  created_at: string;
  clicks: number;
  conversions: number;
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
