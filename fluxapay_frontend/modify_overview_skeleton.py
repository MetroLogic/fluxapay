import re

with open('/Users/victor/Desktop/fluxapay/fluxapay_frontend/src/app/admin/overview/page.tsx', 'r') as f:
    content = f.read()

# Remove the import
content = content.replace('import { Skeleton } from "@/components/ui/skeleton";\n', '')

# Replace Skeleton components
content = content.replace('<Skeleton className="h-10 w-64" />', '<div className="h-10 w-64 animate-pulse bg-muted rounded-md" />')
content = content.replace('<Skeleton className="h-10 w-32" />', '<div className="h-10 w-32 animate-pulse bg-muted rounded-md" />')
content = content.replace('<Skeleton key={i} className="h-[120px] rounded-xl" />', '<div key={i} className="h-[120px] animate-pulse bg-muted rounded-xl" />')
content = content.replace('<Skeleton className="col-span-4 h-[300px] rounded-xl" />', '<div className="col-span-4 h-[300px] animate-pulse bg-muted rounded-xl" />')
content = content.replace('<Skeleton className="col-span-3 h-[300px] rounded-xl" />', '<div className="col-span-3 h-[300px] animate-pulse bg-muted rounded-xl" />')
content = content.replace('<Skeleton className="h-[400px] rounded-xl" />', '<div className="h-[400px] animate-pulse bg-muted rounded-xl" />')


with open('/Users/victor/Desktop/fluxapay/fluxapay_frontend/src/app/admin/overview/page.tsx', 'w') as f:
    f.write(content)
