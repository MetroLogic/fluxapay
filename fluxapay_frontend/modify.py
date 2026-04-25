import re

with open('/Users/victor/Desktop/fluxapay/fluxapay_frontend/src/app/admin/reconciliation/page.tsx', 'r') as f:
    content = f.read()

# 1. Replace imports and types
content = re.sub(
    r'// ─── Types ────────────────────────────────────────────────────────────────.*?// ─── Component ─────────────────────────────────────────────────────────',
    '''import { useAdminReconciliation } from "../../../hooks/useAdminReconciliation";
import { ReconciliationRecord, DiscrepancyAlert } from "../../../types/reconciliation";

interface StatusConfig {
  color: string;
  bg: string;
  border: string;
  icon: JSX.Element;
  label: string;
  glow: string;
}

// ─── Component ─────────────────────────────────────────────────────────''',
    content,
    flags=re.DOTALL
)

# 2. Update Component state block
content = re.sub(
    r'const AdminReconciliationPage = \(\) => {.*?const getStatusConfig =',
    '''const AdminReconciliationPage = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedRecord, setSelectedRecord] =
    useState<ReconciliationRecord | null>(null);
  const [showRunModal, setShowRunModal] = useState(false);
  
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const [globalStart, setGlobalStart] = useState<Date>(thirtyDaysAgo);
  const [globalEnd, setGlobalEnd] = useState<Date>(new Date());
  
  const [periodStart, setPeriodStart] = useState(thirtyDaysAgo.toISOString().split("T")[0]);
  const [periodEnd, setPeriodEnd] = useState(new Date().toISOString().split("T")[0]);
  
  const [activeTab, setActiveTab] = useState<"overview" | "alerts">("overview");

  const { records: rawRecords, summary, discrepancies, loading, resolveDiscrepancy } = 
    useAdminReconciliation({ start: globalStart, end: globalEnd });
    
  const records = rawRecords.map(r => ({
    ...r,
    alerts: discrepancies.filter(d => d.settlementId === r.id || d.reconciliationRecordId === r.id)
  }));

  const handleExport = () => {
    if (records.length === 0) {
      toast.error("No records to export.");
      return;
    }
    const csvContent = "data:text/csv;charset=utf-8," 
      + "Record ID,Period Start,Period End,USDC Swept,Fiat Payouts,Fees,Discrepancy Amount,Discrepancy %,Status\\n"
      + records.map(r => {
          return `${r.id},${r.period_start},${r.period_end},${r.usdcReceived},${r.fiatPayout},${r.fees},${r.discrepancy},${r.discrepancy_percent},${r.status}`;
      }).join("\\n");
      
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `admin_reconciliations_${new Date().toISOString()}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  // ─── Helpers ────────────────────────────────────────────────────

  const getStatusConfig =''',
    content,
    flags=re.DOTALL
)

# 3. Update field mappings
content = content.replace("ReconciliationRecord[\"status\"]", "string | undefined")
content = content.replace("ReconciliationAlert[\"severity\"]", "string | undefined")

# Alert acknowledging logic uses "resolveDiscrepancy"
content = content.replace(
'''  const handleAcknowledgeAlert = (alertId: string) => {
    toast.success(`Alert ${alertId} acknowledged`);
  };''',
'''  const handleAcknowledgeAlert = async (alertId: string) => {
    try {
      await resolveDiscrepancy(alertId);
      toast.success(`Alert ${alertId} resolved`);
    } catch (err) {
      toast.error(`Failed to resolve alert: ${err}`);
    }
  };'''
)

# 4. Fix properties mapping throughout UI (usdcReceived, fiatPayout, etc)
content = content.replace("!a.acknowledged", "!a.resolved")
content = content.replace("alert.acknowledged", "alert.resolved")
content = content.replace("alert.alert_type", "alert.type")

content = content.replace("r.discrepancy_percent", "(r.discrepancy_percent || 0)")
content = content.replace("r.total_usdc_swept", "r.usdcReceived")
content = content.replace("r.total_fiat_payouts", "r.fiatPayout")
content = content.replace("r.total_fees", "r.fees")

# Fix payments_count and settlements_count 
content = content.replace("r.payments_count", "0")
content = content.replace("r.settlements_count", "0")
content = content.replace("selectedRecord.payments_count", "0")
content = content.replace("selectedRecord.settlements_count", "0")
content = content.replace("selectedRecord.actual_balance", "selectedRecord.fiatPayout")
content = content.replace("selectedRecord.expected_balance", "selectedRecord.usdcReceived")


content = content.replace('''  const handleRunReconciliation = () => {
    if (!periodStart || !periodEnd) {
      toast.error("Please select both start and end dates");
      return;
    }
    toast.success(
      "Reconciliation started for period " + periodStart + " to " + periodEnd,
    );
    setShowRunModal(false);
    setPeriodStart("");
    setPeriodEnd("");
  };''', '''  const handleRunReconciliation = () => {
    if (!periodStart || !periodEnd) {
      toast.error("Please select both start and end dates");
      return;
    }
    setGlobalStart(new Date(periodStart));
    setGlobalEnd(new Date(periodEnd));
    toast.success(
      "Fetching reconciliation for period " + periodStart + " to " + periodEnd,
    );
    setShowRunModal(false);
  };''')

content = content.replace('''<button className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all shadow-sm">
                <Download className="w-4 h-4" />
                Export
              </button>''', '''<button onClick={handleExport} className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all shadow-sm">
                <Download className="w-4 h-4" />
                Export
              </button>''')

content = content.replace('stats.totalSwept', '(summary?.totalUSDCReceived || 0)')

content = content.replace(
'''                      $
                      {records
                        .reduce(
                          (sum, r) => sum + r.total_fiat_payouts + r.total_fees,
                          0,
                        )
                        .toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                        })}''',
'''                      $
                      {(summary?.totalFiatPayout || 0).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                        })}'''
)

# Avoid .toString() or .toLocaleDateString() on missing period_start/end
content = re.sub(
r'{new Date\(r\.period_start\)\.toLocaleDateString\(',
r'{r.period_start ? new Date(r.period_start).toLocaleDateString(', content
)

content = re.sub(
r'{new Date\(selectedRecord\.period_start\)\.toLocaleDateString\(',
r'{selectedRecord.period_start ? new Date(selectedRecord.period_start).toLocaleDateString(', content
)

# And similarly for period_end
content = content.replace('“', '"').replace('”', '"')

with open('/Users/victor/Desktop/fluxapay/fluxapay_frontend/src/app/admin/reconciliation/page.tsx', 'w') as f:
    f.write(content)

