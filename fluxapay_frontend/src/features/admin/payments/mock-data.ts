import { Payment } from './types';

export const MOCK_PAYMENTS: Payment[] = [
    {
        id: 'pay_1234567890',
        merchantId: 'mer_abc123',
        merchantName: 'Acme Corp',
        amount: 150.00,
        currency: 'USDC',
        status: 'completed',
        networkTxHash: 'e6a8...9b12',
        createdAt: '2025-10-24T10:00:00Z',
        updatedAt: '2025-10-24T10:05:00Z',
        settlementId: 'set_98765',
        events: [
            {
                id: 'evt_1',
                timestamp: '2025-10-24T10:00:00Z',
                title: 'Payment Initiated',
                description: 'Customer initiated payment session',
                type: 'off-chain',
            },
            {
                id: 'evt_2',
                timestamp: '2025-10-24T10:02:30Z',
                title: 'Blockchain Transaction Detected',
                description: 'Transaction seen in mempool',
                type: 'on-chain',
                txHash: 'e6a8...9b12'
            },
            {
                id: 'evt_3',
                timestamp: '2025-10-24T10:05:00Z',
                title: 'Payment Confirmed',
                description: 'Payment successfully settled on ledger',
                type: 'system',
            }
        ]
    },
    {
        id: 'pay_0987654321',
        merchantId: 'mer_xyz789',
        merchantName: 'Global Traders Ltd',
        amount: 2500.50,
        currency: 'XLM',
        status: 'processing',
        createdAt: '2025-10-24T11:30:00Z',
        updatedAt: '2025-10-24T11:30:00Z',
        events: [
            {
                id: 'evt_4',
                timestamp: '2025-10-24T11:30:00Z',
                title: 'Payment Created',
                description: 'Waiting for network confirmation',
                type: 'system',
            }
        ]
    },
    {
        id: 'pay_failed_example',
        merchantId: 'mer_abc123',
        merchantName: 'Acme Corp',
        amount: 45.00,
        currency: 'USDC',
        status: 'failed',
        createdAt: '2025-10-23T09:15:00Z',
        updatedAt: '2025-10-23T09:30:00Z',
        events: [
            {
                id: 'evt_5',
                timestamp: '2025-10-23T09:15:00Z',
                title: 'Payment Initiated',
                description: 'User started payment',
                type: 'off-chain',
            },
            {
                id: 'evt_6',
                timestamp: '2025-10-23T09:30:00Z',
                title: 'Timeout',
                description: 'Payment window expired without transaction',
                type: 'system',
            }
        ]
    },
    {
        id: 'pay_settled_example',
        merchantId: 'mer_tech_innovate',
        merchantName: 'Tech Innovate Inc',
        amount: 12500.00,
        currency: 'NGN',
        status: 'completed',
        networkTxHash: 'a1b2...c3d4',
        createdAt: '2025-10-22T14:20:00Z',
        updatedAt: '2025-10-22T15:00:00Z',
        settlementId: 'set_112233',
        events: [
            {
                id: 'evt_7',
                timestamp: '2025-10-22T14:20:00Z',
                title: 'Payment Received',
                description: 'Funds received in vault wallet',
                type: 'on-chain',
                txHash: 'a1b2...c3d4'
            },
            {
                id: 'evt_8',
                timestamp: '2025-10-22T15:00:00Z',
                title: 'Settled',
                description: 'Funds settled to merchant bank account',
                type: 'off-chain',
            }
        ]
    }
];
