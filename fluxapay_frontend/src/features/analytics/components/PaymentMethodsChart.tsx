'use client';

import {
    PieChart,
    Pie,
    Cell,
    Tooltip,
    ResponsiveContainer,
    Legend,
} from 'recharts';
import { PaymentDistribution } from '@/services/analytics';

interface PaymentMethodsChartProps {
    data: PaymentDistribution[];
}

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#64748b'];

export function PaymentMethodsChart({ data }: PaymentMethodsChartProps) {
    return (
        <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                    <Pie
                        data={data}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                        nameKey="method"
                    >
                        {data.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
                        ))}
                    </Pie>
                    <Tooltip
                        contentStyle={{
                            borderRadius: '8px',
                            border: 'none',
                            boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
                        }}
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        formatter={(value: any) => [`${Number(value || 0).toLocaleString()}%`, 'Distribution']}
                    />
                    <Legend
                        verticalAlign="bottom"
                        height={36}
                        iconType="circle"
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        formatter={(value: any) => <span className="text-xs text-slate-600">{value}</span>}
                    />
                </PieChart>
            </ResponsiveContainer>
        </div>
    );
}
