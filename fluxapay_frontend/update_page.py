import re

with open('/Users/victor/Desktop/fluxapay/fluxapay_frontend/src/app/dashboard/payments/page.tsx', 'r') as f:
    content = f.read()

# Update `const [, setSearch] = useState("");`
content = content.replace('const [, setSearch] = useState("");', 'const [search, setSearch] = useState("");')

# Update `<PaymentsFilters ... />`
old_filters = """        <PaymentsFilters
          onSearchChange={handleSearchChange}
          onStatusChange={(v) => setStatusFilter(v)}
          onCurrencyChange={(v) => setCurrencyFilter(v)}
        />"""

new_filters = """        <PaymentsFilters
          searchValue={search}
          statusValue={statusFilter}
          currencyValue={currencyFilter}
          onSearchChange={handleSearchChange}
          onStatusChange={(v) => setStatusFilter(v)}
          onCurrencyChange={(v) => setCurrencyFilter(v)}
        />"""

content = content.replace(old_filters, new_filters)

with open('/Users/victor/Desktop/fluxapay/fluxapay_frontend/src/app/dashboard/payments/page.tsx', 'w') as f:
    f.write(content)
