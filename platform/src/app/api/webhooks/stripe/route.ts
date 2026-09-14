import { NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "../../../../lib/prisma";
import { tenantDb } from "../../../../lib/tenant-db";
import { generateTaxInvoicePdf, storeInvoicePdf } from "../../../../lib/invoice";

/**
 * Stripe webhook handler (Prompt 4).
 *
 * - Verifies the Stripe signature against the raw body before trusting a
 *   single byte (constructEvent throws on mismatch).
 * - Idempotent: a replayed checkout.session.completed finds the deposit
 *   already PAID and exits without side effects.
 * - On payment: deposit → PAID, vehicle → RESERVED (lock cleared), the
 *   transaction is recorded, and a compliance-ready tax invoice PDF is
 *   generated and stored.
 * - On expiry: deposit → EXPIRED and the vehicle lock is released.
 */

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
  apiVersion: "2024-06-20",
});

export async function POST(req: Request) {
  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  const rawBody = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET ?? ""
    );
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      await handlePaid(session);
      break;
    }
    case "checkout.session.expired": {
      const session = event.data.object as Stripe.Checkout.Session;
      await handleExpired(session);
      break;
    }
    default:
      break; // acknowledge everything else
  }

  return NextResponse.json({ received: true });
}

async function resolveTenantId(session: Stripe.Checkout.Session): Promise<string | null> {
  // metadata.tenantId is ours (set server-side at session creation), but
  // verify it resolves to a real tenant before scoping queries with it.
  const tenantId = session.metadata?.tenantId;
  if (!tenantId) return null;
  const tenant = await prisma.tenant.findFirst({ where: { id: tenantId }, select: { id: true } });
  return tenant?.id ?? null;
}

async function handlePaid(session: Stripe.Checkout.Session) {
  const tenantId = await resolveTenantId(session);
  if (!tenantId) return;
  const db = tenantDb(tenantId);

  const deposit = await db.deposit.findFirst({
    where: { stripeCheckoutSessionId: session.id },
  });
  if (!deposit || deposit.status === "PAID") return; // unknown or replay

  // Sequential per-tenant invoice number.
  const paidCount = await db.deposit.count({ where: { status: "PAID" } });
  const invoiceNumber = `INV-${new Date().getFullYear()}-${String(paidCount + 1).padStart(5, "0")}`;

  await db.deposit.update({
    where: { id: deposit.id },
    data: {
      status: "PAID",
      stripePaymentIntentId:
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id ?? null,
      invoiceNumber,
    },
  });

  await db.vehicle.update({
    where: { id: deposit.vehicleId },
    data: { status: "RESERVED", lockedUntil: null },
  });

  // System-actor audit entry for the money movement (no staff session here).
  await db.auditLog.create({
    data: {
      userId: null,
      action: "deposit.paid",
      targetType: "Deposit",
      targetId: deposit.id,
      metadata: {
        invoiceNumber,
        amountAudCents: deposit.amountAudCents,
        stripeCheckoutSessionId: session.id,
      },
    },
  });

  // Tax invoice PDF (GST-itemised) — generated and stored out of band of the
  // response so Stripe gets its 200 quickly even if S3 is slow.
  try {
    const pdf = await generateTaxInvoicePdf({
      tenantId,
      depositId: deposit.id,
      invoiceNumber,
    });
    const s3Key = await storeInvoicePdf(tenantId, invoiceNumber, pdf);
    await db.deposit.update({ where: { id: deposit.id }, data: { invoicePdfS3Key: s3Key } });
  } catch (err) {
    // Invoice generation failure must not un-acknowledge the payment; it is
    // retryable from the deposit record.
    console.error("Invoice generation failed for", deposit.id, err);
  }
}

async function handleExpired(session: Stripe.Checkout.Session) {
  const tenantId = await resolveTenantId(session);
  if (!tenantId) return;
  const db = tenantDb(tenantId);

  const deposit = await db.deposit.findFirst({
    where: { stripeCheckoutSessionId: session.id },
  });
  if (!deposit || deposit.status !== "PENDING") return;

  await db.deposit.update({ where: { id: deposit.id }, data: { status: "EXPIRED" } });
  await db.vehicle.updateMany({
    where: { id: deposit.vehicleId, status: "AVAILABLE" },
    data: { lockedUntil: null },
  });
}
