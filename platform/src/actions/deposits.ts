"use server";

import { z } from "zod";
import Stripe from "stripe";
import { prisma } from "../lib/prisma";
import { tenantDb } from "../lib/tenant-db";

/**
 * Vehicle reservation deposits via Stripe Connect (Prompt 4).
 *
 * PCI-DSS (CLAUDE.md §2): card data never touches this server — the customer
 * pays on Stripe Checkout (Payment Element under the hood); we only handle
 * session ids. Funds route directly to the tenant's connected account via
 * `on_behalf_of` + `transfer_data.destination`.
 *
 * Double-selling guard: creating a checkout session atomically locks the
 * vehicle (status must be AVAILABLE and not already locked) for 30 minutes.
 * The webhook (api/webhooks/stripe) flips it to RESERVED on payment; the
 * lock simply lapses if the customer abandons checkout.
 */

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
  apiVersion: "2024-06-20",
});

const DEPOSIT_AUD_CENTS = 50_000; // $500 holding deposit
const LOCK_MINUTES = 30;

const schema = z.object({
  tenantSlug: z.string().min(1).max(64).regex(/^[a-z0-9-]+$/),
  vehicleId: z.string().cuid(),
  customer: z.object({
    firstName: z.string().trim().min(1).max(80),
    lastName: z.string().trim().min(1).max(80),
    email: z.string().trim().email().max(254),
    phone: z.string().trim().regex(/^[+()\d\s-]{6,20}$/).optional(),
  }),
});

export type CreateDepositResult =
  | { ok: true; checkoutUrl: string }
  | { ok: false; error: string };

export async function createDepositCheckout(input: unknown): Promise<CreateDepositResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const { tenantSlug, vehicleId, customer: c } = parsed.data;

  const tenant = await prisma.tenant.findFirst({
    where: { slug: tenantSlug, active: true },
    select: { id: true, name: true, stripeAccountId: true },
  });
  if (!tenant) return { ok: false, error: "Unknown storefront." };
  if (!tenant.stripeAccountId) {
    return { ok: false, error: "This dealership does not accept online deposits yet." };
  }

  const db = tenantDb(tenant.id);
  const now = new Date();
  const lockedUntil = new Date(now.getTime() + LOCK_MINUTES * 60_000);

  // Atomic lock: updateMany's WHERE only matches an unlocked, available car,
  // so two simultaneous buyers cannot both pass this gate.
  const locked = await db.vehicle.updateMany({
    where: {
      id: vehicleId,
      status: "AVAILABLE",
      OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
    },
    data: { lockedUntil },
  });
  if (locked.count !== 1) {
    return { ok: false, error: "This vehicle is currently being reserved by another customer." };
  }

  const vehicle = await db.vehicle.findFirst({ where: { id: vehicleId } });
  if (!vehicle) return { ok: false, error: "Vehicle not found." };

  try {
    // Upsert the customer record for this deposit.
    const email = c.email.toLowerCase();
    const existing = await db.customer.findFirst({ where: { email } });
    const customer =
      existing ??
      (await db.customer.create({
        data: { firstName: c.firstName, lastName: c.lastName, email, phone: c.phone ?? null },
      }));

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: email,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "aud",
            unit_amount: DEPOSIT_AUD_CENTS,
            product_data: {
              name: `Holding deposit — ${vehicle.year} ${vehicle.make} ${vehicle.model}`,
              description: `Stock #${vehicle.stockNumber} at ${tenant.name}`,
            },
          },
        },
      ],
      payment_intent_data: {
        on_behalf_of: tenant.stripeAccountId,
        transfer_data: { destination: tenant.stripeAccountId },
        description: `Vehicle holding deposit — stock #${vehicle.stockNumber}`,
      },
      metadata: {
        tenantId: tenant.id,
        vehicleId: vehicle.id,
        customerId: customer.id,
      },
      expires_at: Math.floor(lockedUntil.getTime() / 1000),
      success_url: `${process.env.APP_BASE_URL}/reserve/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.APP_BASE_URL}/vehicles/${vehicle.id}?cancelled=1`,
    });

    await db.deposit.create({
      data: {
        vehicleId: vehicle.id,
        customerId: customer.id,
        amountAudCents: DEPOSIT_AUD_CENTS,
        stripeCheckoutSessionId: session.id,
      },
    });

    if (!session.url) throw new Error("Stripe did not return a checkout URL");
    return { ok: true, checkoutUrl: session.url };
  } catch (err) {
    // Roll the lock back so the car is immediately buyable again.
    await db.vehicle.updateMany({
      where: { id: vehicleId, lockedUntil },
      data: { lockedUntil: null },
    });
    console.error("createDepositCheckout failed:", err);
    return { ok: false, error: "Could not start the reservation. Please try again." };
  }
}
