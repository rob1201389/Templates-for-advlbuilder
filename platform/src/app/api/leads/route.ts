import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "../../../lib/prisma";
import { tenantDb } from "../../../lib/tenant-db";
import { leadIntakeLimiter, checkLimit, clientIp } from "../../../lib/rate-limit";
import { encryptPii } from "../../../lib/crypto";

/**
 * Public lead intake (Prompt 3 — LMS).
 *
 * POST /api/leads
 * Accepts submissions from tenant storefront forms and the chatbot.
 * - Zod-validated and length-capped: no client input is trusted (CLAUDE.md §4).
 * - Rate limited per IP via Upstash Redis (5/min, fail-closed).
 * - Spam Act 2003: marketingOptIn defaults to false and must be an explicit
 *   true from an unchecked-by-default box.
 * - If a driver's licence number is supplied (test-drive requests), it is
 *   AES-256-GCM encrypted before persistence (APP 11) — the plaintext never
 *   reaches the database layer.
 */

const leadSchema = z.object({
  tenantSlug: z.string().min(1).max(64).regex(/^[a-z0-9-]+$/),
  source: z.enum(["CHATBOT", "WEB_FORM", "CARSALES", "PHONE", "WALK_IN", "REFERRAL", "OTHER"]),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(254).optional(),
  phone: z
    .string()
    .trim()
    .regex(/^[+()\d\s-]{6,20}$/, "Invalid phone number")
    .optional(),
  message: z.string().trim().max(4000).optional(),
  vehicleStockNumber: z.string().trim().max(40).optional(),
  marketingOptIn: z.boolean().default(false),
  testDrive: z
    .object({
      requestedAt: z.coerce.date(),
      driversLicenceNumber: z.string().trim().min(4).max(30).optional(),
    })
    .optional(),
})
.refine((d) => d.email || d.phone, {
  message: "Provide at least an email or a phone number",
});

export async function POST(req: Request) {
  // 1. Rate limit before doing any work (fail closed: this endpoint is the
  // spam target, and losing a burst beats storing garbage).
  const limit = await checkLimit(leadIntakeLimiter, clientIp(req), { failOpen: false });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds ?? 60) } }
    );
  }

  // 2. Parse + validate.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = leadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
      { status: 422 }
    );
  }
  const data = parsed.data;

  // 3. Resolve tenant from the public slug (never from a client-sent id).
  const tenant = await prisma.tenant.findFirst({
    where: { slug: data.tenantSlug, active: true },
    select: { id: true },
  });
  if (!tenant) return NextResponse.json({ error: "Unknown storefront" }, { status: 404 });

  const db = tenantDb(tenant.id);

  // 4. Upsert customer by email (or create fresh when phone-only).
  const email = data.email?.toLowerCase() ?? null;
  let customer = email
    ? await db.customer.findFirst({ where: { email } })
    : null;
  if (customer) {
    // Consent can be granted here but never silently revoked by a later form.
    if (data.marketingOptIn && !customer.marketingOptIn) {
      customer = await db.customer.update({
        where: { id: customer.id },
        data: { marketingOptIn: true, marketingOptInAt: new Date(), phone: data.phone ?? customer.phone },
      });
    }
  } else {
    customer = await db.customer.create({
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        email,
        phone: data.phone ?? null,
        marketingOptIn: data.marketingOptIn,
        marketingOptInAt: data.marketingOptIn ? new Date() : null,
      },
    });
  }

  // 5. Optional vehicle linkage by stock number (tenant-scoped lookup).
  const vehicle = data.vehicleStockNumber
    ? await db.vehicle.findFirst({ where: { stockNumber: data.vehicleStockNumber } })
    : null;

  // 6. Create the lead.
  const lead = await db.lead.create({
    data: {
      source: data.source,
      customerId: customer.id,
      vehicleId: vehicle?.id ?? null,
      message: data.message ?? null,
    },
  });

  // 7. Optional test-drive request; licence number is encrypted at rest.
  if (data.testDrive && vehicle) {
    await db.testDrive.create({
      data: {
        customerId: customer.id,
        vehicleId: vehicle.id,
        scheduledAt: data.testDrive.requestedAt,
        driversLicenceEncrypted: data.testDrive.driversLicenceNumber
          ? encryptPii(data.testDrive.driversLicenceNumber)
          : null,
      },
    });
  }

  return NextResponse.json({ ok: true, leadId: lead.id }, { status: 201 });
}
