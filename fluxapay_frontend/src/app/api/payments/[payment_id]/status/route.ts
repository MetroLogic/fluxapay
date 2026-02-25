import { NextRequest, NextResponse } from 'next/server';

// In-memory store to simulate payment status changes
// In production, this would be stored in a database
const paymentStatusStore = new Map<string, { status: string; createdAt: number }>();

/**
 * Mock API endpoint to poll payment status
 * In production, this would check the actual payment status from your backend/blockchain
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ payment_id: string }> }
) {
  const { payment_id: paymentId } = await params;

  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 200));

  // Get or initialize payment status
  let paymentStatus = paymentStatusStore.get(paymentId);

  if (!paymentStatus) {
    // Initialize with pending status
    paymentStatus = {
      status: 'pending',
      createdAt: Date.now(),
    };
    paymentStatusStore.set(paymentId, paymentStatus);
  }

  // Simulate status change after 10 seconds (for testing)
  // In production, this would check actual blockchain/backend status
  const timeSinceCreation = Date.now() - paymentStatus.createdAt;
  
  // For demo purposes: auto-confirm after 10 seconds if still pending
  if (paymentStatus.status === 'pending' && timeSinceCreation > 10000) {
    paymentStatus.status = 'confirmed';
    paymentStatusStore.set(paymentId, paymentStatus);
  }

  // Handle special test cases
  if (paymentId === 'expired') {
    return NextResponse.json({ status: 'expired' });
  }

  if (paymentId === 'confirmed') {
    return NextResponse.json({ status: 'confirmed' });
  }

  if (paymentId === 'failed') {
    return NextResponse.json({ status: 'failed' });
  }

  return NextResponse.json({ status: paymentStatus.status });
}
