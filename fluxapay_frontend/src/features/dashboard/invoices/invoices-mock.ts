export type InvoiceStatus = "unpaid" | "pending" | "paid" | "overdue";

export interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  customer_name: string;
  customer_email: string;
  line_items: LineItem[];
  total_amount: number;
  currency: string;
  due_date: string;
  notes?: string;
  status: InvoiceStatus;
  payment_link: string;
  created_at: string;
}

export const MOCK_INVOICES: Invoice[] = [
  {
    id: "inv_001",
    invoice_number: "INV-20260201-1234",
    customer_name: "Alice Chambers",
    customer_email: "alice@example.com",
    line_items: [
      { description: "Brand Design Package", quantity: 1, unit_price: 1500 },
      { description: "Logo Revisions", quantity: 2, unit_price: 150 },
    ],
    total_amount: 1800,
    currency: "USD",
    due_date: "2026-03-01T00:00:00Z",
    notes: "Please pay within 30 days.",
    status: "unpaid",
    payment_link: "http://localhost:3001/pay/invoice/INV-20260201-1234",
    created_at: "2026-02-01T09:00:00Z",
  },
  {
    id: "inv_002",
    invoice_number: "INV-20260210-5678",
    customer_name: "Bob Martinez",
    customer_email: "bob@acme.com",
    line_items: [
      { description: "Monthly Retainer", quantity: 1, unit_price: 3000 },
    ],
    total_amount: 3000,
    currency: "USD",
    due_date: "2026-02-28T00:00:00Z",
    status: "pending",
    payment_link: "http://localhost:3001/pay/invoice/INV-20260210-5678",
    created_at: "2026-02-10T11:30:00Z",
  },
  {
    id: "inv_003",
    invoice_number: "INV-20260115-9012",
    customer_name: "Chioma Obi",
    customer_email: "chioma@techcorp.ng",
    line_items: [
      { description: "API Integration", quantity: 40, unit_price: 75 },
      { description: "Documentation", quantity: 5, unit_price: 60 },
    ],
    total_amount: 3300,
    currency: "USD",
    due_date: "2026-02-15T00:00:00Z",
    status: "paid",
    payment_link: "http://localhost:3001/pay/invoice/INV-20260115-9012",
    created_at: "2026-01-15T08:00:00Z",
  },
  {
    id: "inv_004",
    invoice_number: "INV-20260105-3456",
    customer_name: "Dawit Tadesse",
    customer_email: "dawit@startup.io",
    line_items: [
      { description: "Consulting Hours", quantity: 10, unit_price: 200 },
    ],
    total_amount: 2000,
    currency: "EUR",
    due_date: "2026-01-31T00:00:00Z",
    status: "overdue",
    payment_link: "http://localhost:3001/pay/invoice/INV-20260105-3456",
    created_at: "2026-01-05T14:00:00Z",
  },
];
