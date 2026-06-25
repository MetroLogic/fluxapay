#!/usr/bin/env ts-node
/**
 * FluxaPay Local Development Seed Script
 *
 * Creates a predictable set of demo data so you can start developing
 * immediately without manually calling the API.
 *
 * What gets created
 * ─────────────────
 *  • 1 demo merchant (active, with API key + bank account)
 *  • 3 demo customers
 *  • 10 payments (spread across all statuses)
 *  • 4 invoices (pending, paid, overdue, cancelled)
 *  • 6 webhook logs (delivered, failed, retrying)
 *
 * Usage
 * ─────
 *  npx ts-node prisma/seed.ts          # seed (idempotent — safe to re-run)
 *  npx ts-node prisma/seed.ts --reset  # wipe demo data first, then re-seed
 *
 * Or via npm script:
 *  npm run seed
 *  npm run seed:reset
 *
 * The script prints all credentials at the end.
 */

import crypto from "crypto";
import bcrypt from "bcrypt";
import dotenv from "dotenv";
import { PrismaClient } from "../src/generated/client/client";

dotenv.config();

const prisma = new PrismaClient();

// ── Constants ─────────────────────────────────────────────────────────────────

const DEMO_EMAIL = "demo@fluxapay.dev";
const DEMO_PASSWORD_PLAIN = "Demo1234!";
const DEMO_API_KEY = `fpk_test_${"d3m0".repeat(8)}`; // fpk_test_d3m0d3m0d3m0d3m0d3m0d3m0d3m0d3m0
const DEMO_WEBHOOK_URL = "https://webhook.site/fluxapay-demo";

const STELLAR_TESTNET_ADDRESSES = [
    "GBUQWP3BOUZX34ULNQG23RQ6F5DOBAB4NSTOF5AUFF6GPBK476QC6G5",
    "GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGZQE3GGQF2JPSQJNKZQE",
    "GDQOE23CFSUMSVQK4Y5JHPPYK73VYCNHZHA7ENKCV37P6SUEO6XQBKPP",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysAgo(n: number): Date {
    return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

function daysFromNow(n: number): Date {
    return new Date(Date.now() + n * 24 * 60 * 60 * 1000);
}

function buildInvoiceNumber(suffix: string): string {
    const d = new Date();
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `INV-${y}${m}${day}-${suffix}`;
}

function uid(): string {
    return crypto.randomUUID();
}

// ── Reset ─────────────────────────────────────────────────────────────────────

async function resetDemoData(merchantId: string) {
    console.log("🗑️  Resetting existing demo data…");

    // Delete in dependency order
    await prisma.webhookLog.deleteMany({ where: { merchantId } });
    await prisma.invoice.deleteMany({ where: { merchantId } });
    await prisma.payment.deleteMany({ where: { merchantId } });
    await prisma.customer.deleteMany({ where: { merchantId } });
    await prisma.bankAccount.deleteMany({ where: { merchantId } });
    await prisma.merchant.delete({ where: { id: merchantId } });

    console.log("   Done.\n");
}

// ── Merchant ──────────────────────────────────────────────────────────────────

async function seedMerchant() {
    const hashedPassword = await bcrypt.hash(DEMO_PASSWORD_PLAIN, 10);
    const hashedApiKey = await bcrypt.hash(DEMO_API_KEY, 10);
    const apiKeyLastFour = DEMO_API_KEY.slice(-4);
    const webhookSecret = crypto.randomBytes(32).toString("hex");

    const merchant = await prisma.merchant.upsert({
        where: { email: DEMO_EMAIL },
        update: {
            status: "active",
            api_key_hashed: hashedApiKey,
            api_key_last_four: apiKeyLastFour,
        },
        create: {
            email: DEMO_EMAIL,
            business_name: "FluxaPay Demo Store",
            phone_number: "+14155550100",
            country: "US",
            settlement_currency: "USD",
            webhook_url: DEMO_WEBHOOK_URL,
            webhook_secret: webhookSecret,
            password: hashedPassword,
            status: "active",
            api_key_hashed: hashedApiKey,
            api_key_last_four: apiKeyLastFour,
            checkout_accent_color: "#6366f1",
            settlement_schedule: "daily",
        },
    });

    // Bank account (upsert)
    await prisma.bankAccount.upsert({
        where: { merchantId: merchant.id },
        update: {},
        create: {
            merchantId: merchant.id,
            account_name: "FluxaPay Demo Store",
            account_number: "1234567890",
            bank_name: "Demo Bank",
            bank_code: "DEMO001",
            currency: "USD",
            country: "US",
        },
    });

    return merchant;
}

// ── Customers ─────────────────────────────────────────────────────────────────

async function seedCustomers(merchantId: string) {
    const customers = await Promise.all([
        prisma.customer.upsert({
            where: {
                // Prisma doesn't have a unique on (merchantId, email) so we use findFirst + create
                // We'll handle this manually below
                id: "seed-customer-alice",
            },
            update: {},
            create: {
                id: "seed-customer-alice",
                merchantId,
                email: "alice@example.com",
                metadata: { plan: "pro", region: "us-east" },
            },
        }),
        prisma.customer.upsert({
            where: { id: "seed-customer-bob" },
            update: {},
            create: {
                id: "seed-customer-bob",
                merchantId,
                email: "bob@example.com",
                metadata: { plan: "starter" },
            },
        }),
        prisma.customer.upsert({
            where: { id: "seed-customer-carol" },
            update: {},
            create: {
                id: "seed-customer-carol",
                merchantId,
                email: "carol@example.com",
                metadata: {},
            },
        }),
    ]);

    return customers;
}

// ── Payments ──────────────────────────────────────────────────────────────────

async function seedPayments(
    merchantId: string,
    customers: { id: string }[],
) {
    const checkoutBase =
        process.env.PAY_CHECKOUT_BASE ||
        process.env.BASE_URL ||
        "http://localhost:3000";

    const paymentDefs: Array<{
        id: string;
        amount: number;
        currency: string;
        customer_email: string;
        description: string;
        status: string;
        customerId?: string;
        stellar_address?: string;
        transaction_hash?: string;
        confirmed_at?: Date;
        swept?: boolean;
        swept_at?: Date;
        settled?: boolean;
        settled_at?: Date;
        createdAt?: Date;
    }> = [
            {
                id: "seed-pay-001",
                amount: 150.0,
                currency: "USDC",
                customer_email: "alice@example.com",
                description: "Pro plan subscription",
                status: "confirmed",
                customerId: customers[0].id,
                stellar_address: STELLAR_TESTNET_ADDRESSES[0],
                transaction_hash: "abc123def456" + "0".repeat(52),
                confirmed_at: daysAgo(2),
                swept: true,
                swept_at: daysAgo(1),
                settled: true,
                settled_at: daysAgo(1),
                createdAt: daysAgo(3),
            },
            {
                id: "seed-pay-002",
                amount: 75.5,
                currency: "USDC",
                customer_email: "bob@example.com",
                description: "Starter plan",
                status: "pending",
                customerId: customers[1].id,
                stellar_address: STELLAR_TESTNET_ADDRESSES[1],
                createdAt: daysAgo(0),
            },
            {
                id: "seed-pay-003",
                amount: 200.0,
                currency: "USDC",
                customer_email: "carol@example.com",
                description: "One-time purchase",
                status: "expired",
                customerId: customers[2].id,
                createdAt: daysAgo(5),
            },
            {
                id: "seed-pay-004",
                amount: 50.0,
                currency: "USDC",
                customer_email: "alice@example.com",
                description: "Add-on feature",
                status: "failed",
                customerId: customers[0].id,
                createdAt: daysAgo(4),
            },
            {
                id: "seed-pay-005",
                amount: 300.0,
                currency: "USDC",
                customer_email: "bob@example.com",
                description: "Annual plan",
                status: "confirmed",
                customerId: customers[1].id,
                stellar_address: STELLAR_TESTNET_ADDRESSES[2],
                transaction_hash: "def789ghi012" + "0".repeat(52),
                confirmed_at: daysAgo(7),
                swept: true,
                swept_at: daysAgo(6),
                settled: true,
                settled_at: daysAgo(6),
                createdAt: daysAgo(8),
            },
            {
                id: "seed-pay-006",
                amount: 99.99,
                currency: "USDC",
                customer_email: "carol@example.com",
                description: "Consulting session",
                status: "partially_paid",
                customerId: customers[2].id,
                stellar_address: STELLAR_TESTNET_ADDRESSES[0],
                createdAt: daysAgo(1),
            },
            {
                id: "seed-pay-007",
                amount: 500.0,
                currency: "USDC",
                customer_email: "alice@example.com",
                description: "Enterprise setup fee",
                status: "overpaid",
                customerId: customers[0].id,
                stellar_address: STELLAR_TESTNET_ADDRESSES[1],
                transaction_hash: "ghi345jkl678" + "0".repeat(52),
                confirmed_at: daysAgo(10),
                createdAt: daysAgo(11),
            },
            {
                id: "seed-pay-008",
                amount: 25.0,
                currency: "USDC",
                customer_email: "bob@example.com",
                description: "SMS credits",
                status: "pending",
                customerId: customers[1].id,
                createdAt: daysAgo(0),
            },
            {
                id: "seed-pay-009",
                amount: 180.0,
                currency: "USDC",
                customer_email: "carol@example.com",
                description: "API access — monthly",
                status: "confirmed",
                customerId: customers[2].id,
                stellar_address: STELLAR_TESTNET_ADDRESSES[2],
                transaction_hash: "jkl901mno234" + "0".repeat(52),
                confirmed_at: daysAgo(14),
                swept: true,
                swept_at: daysAgo(13),
                settled: true,
                settled_at: daysAgo(13),
                createdAt: daysAgo(15),
            },
            {
                id: "seed-pay-010",
                amount: 45.0,
                currency: "USDC",
                customer_email: "alice@example.com",
                description: "Storage upgrade",
                status: "pending",
                customerId: customers[0].id,
                createdAt: daysAgo(0),
            },
        ];

    const payments = [];
    for (const def of paymentDefs) {
        const payment = await prisma.payment.upsert({
            where: { id: def.id },
            update: {},
            create: {
                id: def.id,
                merchantId,
                amount: def.amount,
                currency: def.currency,
                customer_email: def.customer_email,
                description: def.description,
                metadata: { seed: true, description: def.description },
                expiration: def.status === "expired" ? daysAgo(1) : daysFromNow(1),
                status: def.status as any,
                checkout_url: `${checkoutBase}/pay/${def.id}`,
                stellar_address: def.stellar_address ?? null,
                transaction_hash: def.transaction_hash ?? null,
                confirmed_at: def.confirmed_at ?? null,
                swept: def.swept ?? false,
                swept_at: def.swept_at ?? null,
                settled: def.settled ?? false,
                settled_at: def.settled_at ?? null,
                customerId: def.customerId ?? null,
                createdAt: def.createdAt ?? new Date(),
            },
        });
        payments.push(payment);
    }

    return payments;
}

// ── Invoices ──────────────────────────────────────────────────────────────────

async function seedInvoices(
    merchantId: string,
    payments: { id: string }[],
) {
    // We link invoices to payments that don't already have one.
    // Use the confirmed payments (indices 0, 4, 8) and a standalone pending one.
    const invoiceDefs = [
        {
            id: "seed-inv-001",
            invoice_number: buildInvoiceNumber("SEED01"),
            amount: 150.0,
            currency: "USDC",
            customer_email: "alice@example.com",
            status: "paid" as const,
            payment_id: payments[0].id, // seed-pay-001 (confirmed)
            due_date: daysAgo(5),
        },
        {
            id: "seed-inv-002",
            invoice_number: buildInvoiceNumber("SEED02"),
            amount: 300.0,
            currency: "USDC",
            customer_email: "bob@example.com",
            status: "paid" as const,
            payment_id: payments[4].id, // seed-pay-005 (confirmed)
            due_date: daysAgo(10),
        },
        {
            id: "seed-inv-003",
            invoice_number: buildInvoiceNumber("SEED03"),
            amount: 99.0,
            currency: "USDC",
            customer_email: "carol@example.com",
            status: "overdue" as const,
            payment_id: null, // standalone — no linked payment
            due_date: daysAgo(3),
        },
        {
            id: "seed-inv-004",
            invoice_number: buildInvoiceNumber("SEED04"),
            amount: 250.0,
            currency: "USDC",
            customer_email: "alice@example.com",
            status: "pending" as const,
            payment_id: null, // standalone
            due_date: daysFromNow(14),
        },
    ];

    const invoices = [];
    for (const def of invoiceDefs) {
        const invoice = await prisma.invoice.upsert({
            where: { id: def.id },
            update: {},
            create: {
                id: def.id,
                merchantId,
                invoice_number: def.invoice_number,
                amount: def.amount,
                currency: def.currency,
                customer_email: def.customer_email,
                status: def.status,
                payment_id: def.payment_id,
                payment_link: def.payment_id ? `/pay/${def.payment_id}` : `/pay/standalone-${def.id}`,
                due_date: def.due_date,
                metadata: { seed: true },
            },
        });
        invoices.push(invoice);
    }

    return invoices;
}

// ── Webhook Logs ──────────────────────────────────────────────────────────────

async function seedWebhookLogs(
    merchantId: string,
    payments: { id: string }[],
) {
    const logDefs = [
        {
            id: "seed-wh-001",
            event_type: "payment_completed" as const,
            status: "delivered" as const,
            http_status: 200,
            payment_id: payments[0].id,
            event_id: "evt_seed_001",
            retry_count: 0,
            created_at: daysAgo(2),
        },
        {
            id: "seed-wh-002",
            event_type: "payment_completed" as const,
            status: "delivered" as const,
            http_status: 200,
            payment_id: payments[4].id,
            event_id: "evt_seed_002",
            retry_count: 0,
            created_at: daysAgo(7),
        },
        {
            id: "seed-wh-003",
            event_type: "payment_failed" as const,
            status: "failed" as const,
            http_status: 500,
            payment_id: payments[3].id,
            event_id: "evt_seed_003",
            retry_count: 5,
            failure_reason: "Endpoint returned 500 Internal Server Error",
            failed_at: daysAgo(4),
            created_at: daysAgo(4),
        },
        {
            id: "seed-wh-004",
            event_type: "payment_pending" as const,
            status: "retrying" as const,
            http_status: 503,
            payment_id: payments[1].id,
            event_id: "evt_seed_004",
            retry_count: 2,
            next_retry_at: daysFromNow(0),
            created_at: daysAgo(0),
        },
        {
            id: "seed-wh-005",
            event_type: "payment_completed" as const,
            status: "delivered" as const,
            http_status: 200,
            payment_id: payments[8].id,
            event_id: "evt_seed_005",
            retry_count: 0,
            created_at: daysAgo(14),
        },
        {
            id: "seed-wh-006",
            event_type: "payment_expired" as const,
            status: "failed" as const,
            http_status: 404,
            payment_id: payments[2].id,
            event_id: "evt_seed_006",
            retry_count: 5,
            failure_reason: "Endpoint not found (404)",
            failed_at: daysAgo(5),
            created_at: daysAgo(5),
        },
    ];

    const logs = [];
    for (const def of logDefs) {
        const log = await prisma.webhookLog.upsert({
            where: { id: def.id },
            update: {},
            create: {
                id: def.id,
                merchantId,
                event_type: def.event_type,
                endpoint_url: DEMO_WEBHOOK_URL,
                http_status: def.http_status,
                status: def.status,
                event_id: def.event_id,
                payment_id: def.payment_id,
                retry_count: def.retry_count,
                max_retries: 5,
                next_retry_at: def.next_retry_at ?? null,
                failure_reason: def.failure_reason ?? null,
                failed_at: def.failed_at ?? null,
                request_payload: {
                    event: def.event_type,
                    payment_id: def.payment_id,
                    timestamp: (def.created_at ?? new Date()).toISOString(),
                },
                response_body: def.http_status === 200 ? '{"received":true}' : null,
                created_at: def.created_at ?? new Date(),
            },
        });
        logs.push(log);
    }

    return logs;
}

// ── Summary ───────────────────────────────────────────────────────────────────

function printSummary(
    merchant: { id: string; email: string; business_name: string },
    counts: {
        customers: number;
        payments: number;
        invoices: number;
        webhookLogs: number;
    },
) {
    const line = "─".repeat(60);
    console.log(`\n${"═".repeat(60)}`);
    console.log("  🌱  FluxaPay Seed Complete");
    console.log(`${"═".repeat(60)}`);

    console.log("\n📦 Demo Merchant");
    console.log(line);
    console.log(`  ID            : ${merchant.id}`);
    console.log(`  Business      : ${merchant.business_name}`);
    console.log(`  Email         : ${merchant.email}`);
    console.log(`  Password      : ${DEMO_PASSWORD_PLAIN}`);
    console.log(`  API Key       : ${DEMO_API_KEY}`);
    console.log(`  Webhook URL   : ${DEMO_WEBHOOK_URL}`);

    console.log("\n📊 Seeded Records");
    console.log(line);
    console.log(`  Customers     : ${counts.customers}`);
    console.log(`  Payments      : ${counts.payments}`);
    console.log(`  Invoices      : ${counts.invoices}`);
    console.log(`  Webhook Logs  : ${counts.webhookLogs}`);

    console.log("\n🚀 Quick Start");
    console.log(line);
    console.log("  # List payments");
    console.log(`  curl http://localhost:3000/api/v1/payments \\`);
    console.log(`    -H "x-api-key: ${DEMO_API_KEY}"\n`);
    console.log("  # Create a payment");
    console.log(`  curl -X POST http://localhost:3000/api/v1/payments \\`);
    console.log(`    -H "x-api-key: ${DEMO_API_KEY}" \\`);
    console.log(`    -H "Content-Type: application/json" \\`);
    console.log(
        `    -d '{"amount":50,"currency":"USDC","customer_email":"test@example.com"}'\n`,
    );
    console.log("  # List invoices");
    console.log(`  curl http://localhost:3000/api/v1/invoices \\`);
    console.log(`    -H "x-api-key: ${DEMO_API_KEY}"\n`);

    console.log(`${"═".repeat(60)}\n`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
    const args = process.argv.slice(2);
    const shouldReset = args.includes("--reset");

    console.log("🌱 FluxaPay seed script starting…\n");

    try {
        // Check if demo merchant already exists
        const existing = await prisma.merchant.findUnique({
            where: { email: DEMO_EMAIL },
        });

        if (existing && shouldReset) {
            await resetDemoData(existing.id);
        } else if (existing) {
            console.log(
                `ℹ️  Demo merchant already exists (${existing.id}).\n` +
                `   Run with --reset to wipe and re-seed.\n` +
                `   Upserting records — no duplicates will be created.\n`,
            );
        }

        // Seed in dependency order
        console.log("👤 Seeding merchant…");
        const merchant = await seedMerchant();
        console.log(`   ✓ ${merchant.business_name} (${merchant.id})`);

        console.log("👥 Seeding customers…");
        const customers = await seedCustomers(merchant.id);
        console.log(`   ✓ ${customers.length} customers`);

        console.log("💳 Seeding payments…");
        const payments = await seedPayments(merchant.id, customers);
        console.log(`   ✓ ${payments.length} payments`);

        console.log("🧾 Seeding invoices…");
        const invoices = await seedInvoices(merchant.id, payments);
        console.log(`   ✓ ${invoices.length} invoices`);

        console.log("🔔 Seeding webhook logs…");
        const webhookLogs = await seedWebhookLogs(merchant.id, payments);
        console.log(`   ✓ ${webhookLogs.length} webhook logs`);

        printSummary(merchant, {
            customers: customers.length,
            payments: payments.length,
            invoices: invoices.length,
            webhookLogs: webhookLogs.length,
        });
    } catch (error) {
        console.error("\n❌ Seed failed:", error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

main();
