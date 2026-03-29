import { TrendingUp } from 'lucide-react';

type Props = {
    title: string;
    value: string | number;
    icon: React.ElementType;
    trend?: string;
};

export function StatCard({ title, value, icon: Icon, trend }: Props) {
    return (
        <div className="rounded-xl border bg-card p-6 shadow">
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-sm font-medium text-muted-foreground">{title}</p>
                    <h3 className="text-2xl font-bold mt-2">{value}</h3>
                    {trend && (
                        <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                            <TrendingUp className="w-3 h-3" />
                            {trend}
                        </p>
                    )}
                </div>
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Icon className="w-6 h-6 text-primary" />
                </div>
            </div>
        </div>
    );
}
