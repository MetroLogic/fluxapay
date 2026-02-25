"use client";

import { useState } from "react";
import { Invoice, LineItem } from "./invoices-mock";
import { Button } from "@/components/Button";

interface InvoiceFormProps {
  onSubmit: (invoice: Omit<Invoice, "id" | "invoice_number" | "payment_link" | "created_at">) => void;
  onCancel: () => void;
}

const CURRENCIES = ["USD", "EUR", "GBP", "NGN", "KES", "GHS"];

const emptyLineItem = (): LineItem => ({ description: "", quantity: 1, unit_price: 0 });

export const InvoiceForm = ({ onSubmit, onCancel }: InvoiceFormProps) => {
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lineItems, setLineItems] = useState<LineItem[]>([emptyLineItem()]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const updateLineItem = (index: number, field: keyof LineItem, value: string | number) => {
    setLineItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  };

  const addLineItem = () => setLineItems((prev) => [...prev, emptyLineItem()]);

  const removeLineItem = (index: number) =>
    setLineItems((prev) => prev.filter((_, i) => i !== index));

  const total = lineItems.reduce(
    (sum, item) => sum + Number(item.quantity) * Number(item.unit_price),
    0
  );

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!customerName.trim()) errs.customerName = "Customer name is required";
    if (!customerEmail.trim() || !/\S+@\S+\.\S+/.test(customerEmail))
      errs.customerEmail = "Valid email is required";
    if (!dueDate) errs.dueDate = "Due date is required";
    lineItems.forEach((item, i) => {
      if (!item.description.trim())
        errs[`desc_${i}`] = "Description required";
      if (Number(item.quantity) <= 0)
        errs[`qty_${i}`] = "Quantity must be > 0";
      if (Number(item.unit_price) <= 0)
        errs[`price_${i}`] = "Price must be > 0";
    });
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    onSubmit({
      customer_name: customerName,
      customer_email: customerEmail,
      line_items: lineItems.map((item) => ({
        description: item.description,
        quantity: Number(item.quantity),
        unit_price: Number(item.unit_price),
      })),
      total_amount: total,
      currency,
      due_date: new Date(dueDate).toISOString(),
      notes: notes || undefined,
      status: "unpaid",
    });
  };

  const inputClass =
    "h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring";
  const labelClass = "mb-1 block text-sm font-medium";
  const errorClass = "mt-1 text-xs text-red-500";

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-h-[70vh] overflow-y-auto pr-1">
      {/* Customer Info */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Customer Name</label>
          <input
            className={inputClass}
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="Jane Doe"
          />
          {errors.customerName && <p className={errorClass}>{errors.customerName}</p>}
        </div>
        <div>
          <label className={labelClass}>Customer Email</label>
          <input
            type="email"
            className={inputClass}
            value={customerEmail}
            onChange={(e) => setCustomerEmail(e.target.value)}
            placeholder="jane@example.com"
          />
          {errors.customerEmail && <p className={errorClass}>{errors.customerEmail}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Currency</label>
          <select
            className={inputClass}
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Due Date</label>
          <input
            type="date"
            className={inputClass}
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
          {errors.dueDate && <p className={errorClass}>{errors.dueDate}</p>}
        </div>
      </div>

      {/* Line Items */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className={labelClass}>Line Items</label>
          <button
            type="button"
            onClick={addLineItem}
            className="text-xs text-primary hover:underline font-medium"
          >
            + Add item
          </button>
        </div>
        <div className="space-y-3">
          {lineItems.map((item, index) => (
            <div key={index} className="grid grid-cols-[1fr_80px_90px_32px] gap-2 items-start">
              <div>
                <input
                  className={inputClass}
                  placeholder="Description"
                  value={item.description}
                  onChange={(e) => updateLineItem(index, "description", e.target.value)}
                />
                {errors[`desc_${index}`] && (
                  <p className={errorClass}>{errors[`desc_${index}`]}</p>
                )}
              </div>
              <div>
                <input
                  type="number"
                  className={inputClass}
                  placeholder="Qty"
                  min={1}
                  value={item.quantity}
                  onChange={(e) => updateLineItem(index, "quantity", e.target.value)}
                />
                {errors[`qty_${index}`] && (
                  <p className={errorClass}>{errors[`qty_${index}`]}</p>
                )}
              </div>
              <div>
                <input
                  type="number"
                  className={inputClass}
                  placeholder="Unit price"
                  min={0}
                  step="0.01"
                  value={item.unit_price}
                  onChange={(e) => updateLineItem(index, "unit_price", e.target.value)}
                />
                {errors[`price_${index}`] && (
                  <p className={errorClass}>{errors[`price_${index}`]}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => removeLineItem(index)}
                className="mt-2 text-muted-foreground hover:text-red-500 transition-colors disabled:opacity-30"
                disabled={lineItems.length === 1}
                title="Remove item"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Total */}
      <div className="rounded-lg border bg-muted/30 px-4 py-3 flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Total</span>
        <span className="text-lg font-bold">
          {total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
          {currency}
        </span>
      </div>

      {/* Notes */}
      <div>
        <label className={labelClass}>Notes (optional)</label>
        <textarea
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          rows={2}
          placeholder="Payment terms, bank details, etc."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="button" variant="secondary" className="flex-1" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" className="flex-1">
          Create Invoice
        </Button>
      </div>
    </form>
  );
};
