import { PrismaClient, InvoiceStatus } from "../generated/client/client";

const prisma = new PrismaClient();

export interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
}

export interface CreateInvoiceData {
  customer_name: string;
  customer_email: string;
  line_items: LineItem[];
  currency: string;
  due_date: string;
  notes?: string;
}

function generateInvoiceNumber(): string {
  const date = new Date();
  const yyyymmdd = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
  const random = Math.floor(1000 + Math.random() * 9000);
  return `INV-${yyyymmdd}-${random}`;
}

function computeTotal(lineItems: LineItem[]): number {
  return lineItems.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
}

export const InvoiceService = {
  async createInvoice(data: CreateInvoiceData, merchantId: string) {
    const invoice_number = generateInvoiceNumber();
    const total_amount = computeTotal(data.line_items);
    const appUrl = process.env.APP_URL || "http://localhost:3001";
    const payment_link = `${appUrl}/pay/invoice/${invoice_number}`;

    return prisma.invoice.create({
      data: {
        merchantId,
        invoice_number,
        customer_name: data.customer_name,
        customer_email: data.customer_email,
        line_items: data.line_items as object[],
        total_amount,
        currency: data.currency,
        due_date: new Date(data.due_date),
        notes: data.notes,
        payment_link,
        status: "unpaid",
      },
    });
  },

  async getInvoices(
    merchantId: string,
    filters: { status?: string; search?: string; page?: number; limit?: number }
  ) {
    const page = filters.page || 1;
    const limit = filters.limit || 10;

    const where: Record<string, unknown> = {
      merchantId,
      ...(filters.status && filters.status !== "all" && { status: filters.status as InvoiceStatus }),
      ...(filters.search && {
        OR: [
          { invoice_number: { contains: filters.search, mode: "insensitive" } },
          { customer_name: { contains: filters.search, mode: "insensitive" } },
          { customer_email: { contains: filters.search, mode: "insensitive" } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { created_at: "desc" },
      }),
      prisma.invoice.count({ where }),
    ]);

    return { data, meta: { total, page, limit } };
  },

  async getInvoiceById(id: string, merchantId: string) {
    const invoice = await prisma.invoice.findFirst({
      where: { id, merchantId },
    });
    return invoice;
  },

  async updateInvoiceStatus(id: string, status: InvoiceStatus, merchantId: string) {
    const invoice = await prisma.invoice.findFirst({ where: { id, merchantId } });
    if (!invoice) return null;

    return prisma.invoice.update({
      where: { id },
      data: { status },
    });
  },
};
