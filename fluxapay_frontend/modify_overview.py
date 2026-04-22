import re

with open('/Users/victor/Desktop/fluxapay/fluxapay_frontend/src/app/admin/overview/page.tsx', 'r') as f:
    content = f.read()

# Replace MOCK_PAYMENTS import
content = content.replace('import { MOCK_PAYMENTS } from "@/features/admin/payments/mock-data";', 
                          'import { useAdminOverviewStats } from "@/hooks/useAdminOverviewStats";\nimport { Skeleton } from "@/components/ui/skeleton";\nimport { AlertCircle } from "lucide-react";')

# Replace type ActivityItem
content = re.sub(
    r'// Local type for mixed feed.*?type ActivityItem =.*?;', 
    '', 
    content, 
    flags=re.DOTALL
)

# Replace the beginning of the component
top_replacement = '''export default function AdminOverviewPage() {
  const { stats, isLoading, error } = useAdminOverviewStats();

  if (error) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[400px] text-center space-y-4">
        <AlertCircle className="w-12 h-12 text-destructive" />
        <div>
          <h2 className="text-xl font-bold">Failed to load overview data</h2>
          <p className="text-muted-foreground mt-2">You might not have the right permissions, or the server is unreachable.</p>
        </div>
        <Button onClick={() => window.location.reload()} variant="outline">Try Again</Button>
      </div>
    );
  }

  if (isLoading || !stats) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-center mb-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[120px] rounded-xl" />
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
          <Skeleton className="col-span-4 h-[300px] rounded-xl" />
          <Skeleton className="col-span-3 h-[300px] rounded-xl" />
        </div>
        <Skeleton className="h-[400px] rounded-xl" />
      </div>
    );
  }

  const {
    totalVolume,
    totalMerchants,
    activeMerchants,
    totalFees,
    pendingSettlements,
    volumeData,
    statusChartData,
    recentActivity,
  } = stats;
'''

content = re.sub(
    r'export default function AdminOverviewPage\(\) \{.*?\]\.filter\(\(d\) => d\.value > 0\);',
    top_replacement,
    content,
    flags=re.DOTALL
)

# Now, fix `recentActivity` mapping down below
# MOCK_PAYMENTS had `item.data.currency` and `item.data.amount`.
# AdminSettlementRow has `currency` and `amount` too, so that works mostly out of the box.

content = content.replace('item.data.merchantName', 'item.data.merchantName || item.data.merchantId')

with open('/Users/victor/Desktop/fluxapay/fluxapay_frontend/src/app/admin/overview/page.tsx', 'w') as f:
    f.write(content)
