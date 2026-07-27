export type InvoiceStatus = "unpaid" | "pending" | "paid" | "overdue" | "cancelled";

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
