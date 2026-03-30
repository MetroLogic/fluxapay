import { SorobanQueueService } from '../sorobanQueue.service';

// Mock paymentContractService so tests don't hit the network
jest.mock('../paymentContract.service', () => ({
  paymentContractService: {
    verify_payment: jest.fn(),
  },
}));

import { paymentContractService } from '../paymentContract.service';

const mockVerify = paymentContractService.verify_payment as jest.Mock;

describe('SorobanQueueService', () => {
  let queue: SorobanQueueService;

  beforeEach(() => {
    queue = new SorobanQueueService();
    mockVerify.mockReset();
  });

  it('processes a job successfully', async () => {
    mockVerify.mockResolvedValue(true);

    queue.enqueue('pay_1', 'tx_abc', '100');

    // Allow microtasks to flush
    await new Promise((r) => setTimeout(r, 50));

    expect(mockVerify).toHaveBeenCalledWith('pay_1', 'tx_abc', '100');
    expect(queue.size).toBe(0);
  });

  it('retries a failing job up to maxAttempts', async () => {
    mockVerify.mockRejectedValue(new Error('rpc error'));

    queue.enqueue('pay_2', 'tx_def', '50', 2);

    // Wait long enough for 2 attempts (base 1 s back-off is mocked away via jest fake timers)
    await new Promise((r) => setTimeout(r, 3500));

    expect(mockVerify).toHaveBeenCalledTimes(2);
    expect(queue.size).toBe(0);
  }, 10_000);

  it('processes multiple jobs sequentially', async () => {
    const order: string[] = [];
    mockVerify.mockImplementation(async (id: string) => {
      order.push(id);
      return true;
    });

    queue.enqueue('pay_a', 'tx_1', '10');
    queue.enqueue('pay_b', 'tx_2', '20');
    queue.enqueue('pay_c', 'tx_3', '30');

    await new Promise((r) => setTimeout(r, 200));

    expect(order).toEqual(['pay_a', 'pay_b', 'pay_c']);
    expect(queue.size).toBe(0);
  });

  it('reports correct queue size before processing', () => {
    // Pause processing by making verify_payment never resolve during this check
    mockVerify.mockImplementation(() => new Promise(() => {}));

    queue.enqueue('pay_x', 'tx_x', '5');
    // The first job is immediately dequeued into processing, so size is 0
    expect(queue.size).toBe(0);
  });
});
