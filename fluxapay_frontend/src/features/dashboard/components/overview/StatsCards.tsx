import { ArrowUpRight, ArrowDownRight, DollarSign, Activity, CreditCard, Clock, Percent } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string;
  change?: string;
  trend?: "up" | "down" | "neutral";
  icon: React.ElementType;
  description?: string;
  className?: string;
}

const StatCard = ({ title, value, change, trend, icon: Icon, description, className }: StatCardProps) => {
  return (
    <div className={cn("rounded-xl border bg-card text-card-foreground shadow-sm p-6", className)}>
      <div className="flex flex-row items-center justify-between space-y-0 pb-2">
        <h3 className="tracking-tight text-sm font-medium text-muted-foreground">{title}</h3>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div>
        <div className="text-2xl font-bold">{value}</div>
        {(change || description) && (
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
            {change && (
              <span
                className={cn(
                  "flex items-center font-medium",
                  trend === "up" && "text-green-500",
                  trend === "down" && "text-red-500",
                  trend === "neutral" && "text-muted-foreground"
                )}
              >
                {trend === "up" && <ArrowUpRight className="h-3 w-3 mr-0.5" />}
                {trend === "down" && <ArrowDownRight className="h-3 w-3 mr-0.5" />}
                {change}
              </span>
            )}
            {description && <span className="opacity-80">{description}</span>}
          </p>
        )}
      </div>
    </div>
  );
};

export const StatsCards = () => {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <StatCard
        title="Total Revenue"
        value="$45,231.89"
        change="+20.1% from last month"
        trend="up"
        icon={DollarSign}
      />
      <StatCard
        title="Total Payments"
        value="2,350"
        description="Volume: $1.2M"
        change="+180 this week"
        trend="up"
        icon={CreditCard}
      />
      <StatCard
        title="Pending Payments"
        value="12"
        description="Amount: $3,400"
        change="-4 from yesterday"
        trend="down" // Good thing for pending to go down usually? Or maybe neutral.
        icon={Clock}
      />
      <StatCard
        title="Success Rate"
        value="98.2%"
        change="+2% from last week"
        trend="up"
        icon={Percent}
      />
      <StatCard
         title="Avg. Transaction"
         value="$145.00"
         change="+4% from last month"
         trend="up"
         icon={Activity}
         className="md:col-span-2 lg:col-span-1"
      />
    </div>
  );
};
