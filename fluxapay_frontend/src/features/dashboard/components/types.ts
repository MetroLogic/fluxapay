export type Payment = {
    id: string;
    amount: number;
    customer: string;
};

export type Settlement = {
    id: string;
    date: string;
    paymentsCount: number;
    usdcAmount: number;
    fiatAmount: number;
    currency: string;
    status: 'completed' | 'pending' | 'failed';
    bankReference: string;
    conversionRate: number;
    fees: number;
    payments: Payment[];
};
