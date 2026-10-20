'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { ComparisonPoint } from '@/lib/analyticsComparison';

const usd = (v: unknown) => `$${Number(v || 0).toLocaleString()}`;

export function RevenueComparisonChart({ data }: { data: ComparisonPoint[] }) {
    return (
        <div
            className="h-[300px] w-full"
            role="img"
            aria-label="Revenue comparison chart: current period as a solid line, previous period as a dashed line"
        >
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="index" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10 }} tickFormatter={(i: number) => `Day ${i + 1}`} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} tickFormatter={usd} />
                    <Tooltip
                        formatter={(value: unknown, name: unknown, item: { payload?: ComparisonPoint }) => {
                            const p = item?.payload;
                            const date = name === 'Current period' ? p?.currentDate : p?.previousDate;
                            return [usd(value), `${name}${date ? ` (${date})` : ''}`];
                        }}
                        labelFormatter={(i: unknown) => `Day ${Number(i) + 1}`}
                    />
                    <Legend />
                    <Line type="monotone" dataKey="current" name="Current period" stroke="#4f46e5" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="previous" name="Previous period" stroke="#d97706" strokeWidth={2} strokeDasharray="6 4" dot={false} />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}
