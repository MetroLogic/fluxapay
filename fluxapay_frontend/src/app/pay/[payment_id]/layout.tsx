import type { Metadata } from 'next';
import { headers } from 'next/headers';

type MetadataProps = { params: Promise<{ payment_id: string }> };

export async function generateMetadata({ params }: MetadataProps): Promise<Metadata> {
  const { payment_id: paymentId } = await params;
  const h = await headers();
  const host =
    h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3075';
  const forwardedProto = h.get('x-forwarded-proto');
  const proto =
    forwardedProto === 'https' || forwardedProto === 'http'
      ? forwardedProto
      : process.env.NODE_ENV === 'production'
        ? 'https'
        : 'http';

  try {
    const res = await fetch(`${proto}://${host}/api/payments/${encodeURIComponent(paymentId)}`, {
      cache: 'no-store',
    });
    if (!res.ok) {
      return { title: 'Checkout · FluxaPay' };
    }
    const data = (await res.json()) as { merchantName?: string };
    const name =
      typeof data.merchantName === 'string' && data.merchantName.trim()
        ? data.merchantName.trim()
        : 'Merchant';
    return { title: `Pay ${name} · FluxaPay` };
  } catch {
    return { title: 'Checkout · FluxaPay' };
  }
}

export default function PayCheckoutSessionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
