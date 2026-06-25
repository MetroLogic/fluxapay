import re

with open('/Users/victor/Desktop/fluxapay/fluxapay_frontend/src/app/admin/reconciliation/page.tsx', 'r') as f:
    content = f.read()

content = content.replace("selectedRecord.total_usdc_swept", "selectedRecord.usdcReceived")
content = content.replace("selectedRecord.total_fiat_payouts", "selectedRecord.fiatPayout")
content = content.replace("selectedRecord.total_fees", "selectedRecord.fees")

content = content.replace("selectedRecord.discrepancy_percent > 1", "(selectedRecord.discrepancy_percent || 0) > 1")
content = content.replace("selectedRecord.discrepancy_percent.toFixed", "(selectedRecord.discrepancy_percent || 0).toFixed")

content = content.replace("selectedRecord.alerts.length", "(selectedRecord.alerts || []).length")
content = content.replace("selectedRecord.alerts.map", "(selectedRecord.alerts || []).map")

content = content.replace("alert.severity.toUpperCase()", "(alert.severity || 'low').toUpperCase()")
content = content.replace("getSeverityConfig(alert.severity)", "getSeverityConfig(alert.severity || 'low')")
content = content.replace("alert.alert_type", "alert.type")
content = content.replace("alert.message", "alert.description")
content = content.replace("new Date(alert.created_at)", "new Date(alert.date)")

# Replace reviewed_by and reviewed_at
content = re.sub(r'\{selectedRecord\.reviewed_by && \(.*?\)\}', '', content, flags=re.DOTALL)


with open('/Users/victor/Desktop/fluxapay/fluxapay_frontend/src/app/admin/reconciliation/page.tsx', 'w') as f:
    f.write(content)
