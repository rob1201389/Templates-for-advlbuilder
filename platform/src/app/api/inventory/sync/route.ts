import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "../../../../lib/prisma";
import { tenantDb } from "../../../../lib/tenant-db";
import { sha256, safeEqualHex } from "../../../../lib/crypto";

/**
 * Inventory aggregation webhook (Prompt 5).
 *
 * POST /api/inventory/sync
 * Header: x-api-key: <tenant inventory API key>
 *
 * - Auth: the key's SHA-256 digest must match a tenant's stored digest
 *   (constant-time compare; raw keys are never stored).
 * - Zod-validates the whole payload; a single bad row fails the sync with a
 *   422 naming the row, so feeds can't half-apply silently.
 * - Upserts by (feedSource, feedExternalId) falling back to stockNumber —
 *   price/odometer/status changes update in place.
 * - Vehicles missing from a `complete: true` payload are marked SOLD, but
 *   RESERVED vehicles (live deposit) are never auto-transitioned, and only
 *   rows originating from the same feedSource are eligible.
 */

const vehicleRow = z.object({
  externalId: z.string().trim().min(1).max(64),
  vin: z.string().trim().min(11).max(17),
  rego: z.string().trim().max(10).optional(),
  stockNumber: z.string().trim().min(1).max(40),
  make: z.string().trim().min(1).max(60),
  model: z.string().trim().min(1).max(60),
  year: z.number().int().min(1950).max(new Date().getFullYear() + 1),
  bodyType: z.string().trim().max(40).optional(),
  transmission: z.enum(["AUTOMATIC", "MANUAL", "CVT", "DUAL_CLUTCH", "OTHER"]).optional(),
  odometerKm: z.number().int().min(0).max(2_000_000).optional(),
  priceAudCents: z.number().int().min(0).max(500_000_000), // caps at $5M
  status: z.enum(["AVAILABLE", "SOLD"]).default("AVAILABLE"),
});

const payloadSchema = z.object({
  feedSource: z.string().trim().min(1).max(60),
  // complete=true means "this is the full current stock list" and enables
  // the mark-missing-as-sold pass; false/absent means incremental delta.
  complete: z.boolean().default(false),
  vehicles: z.array(vehicleRow).min(1).max(5000),
});

export async function POST(req: Request) {
  // 1. API-key auth → tenant.
  const apiKey = req.headers.get("x-api-key");
  if (!apiKey || apiKey.length < 16 || apiKey.length > 128) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const digest = sha256(apiKey);
  const tenant = await prisma.tenant.findFirst({
    where: { active: true, inventoryApiKeyHash: digest },
    select: { id: true, inventoryApiKeyHash: true },
  });
  // Belt-and-braces constant-time recheck of the digest match.
  if (!tenant || !safeEqualHex(tenant.inventoryApiKeyHash ?? "", digest)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Validate payload.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues.slice(0, 20) },
      { status: 422 }
    );
  }
  const { feedSource, complete, vehicles } = parsed.data;

  const db = tenantDb(tenant.id);
  let created = 0;
  let updated = 0;

  // 3. Upsert every row (tenant scoping is automatic via tenantDb).
  for (const row of vehicles) {
    const existing =
      (await db.vehicle.findFirst({
        where: { feedSource, feedExternalId: row.externalId },
      })) ??
      (await db.vehicle.findFirst({ where: { stockNumber: row.stockNumber } })) ??
      (await db.vehicle.findFirst({ where: { vin: row.vin } }));

    const data = {
      vin: row.vin,
      rego: row.rego ?? null,
      stockNumber: row.stockNumber,
      make: row.make,
      model: row.model,
      year: row.year,
      bodyType: row.bodyType ?? null,
      transmission: row.transmission ?? null,
      odometerKm: row.odometerKm ?? null,
      priceAudCents: row.priceAudCents,
      feedSource,
      feedExternalId: row.externalId,
    };

    if (existing) {
      // Never let a feed row demote a RESERVED car (live deposit in flight).
      const nextStatus =
        existing.status === "RESERVED" ? undefined : row.status;
      await db.vehicle.update({
        where: { id: existing.id },
        data: { ...data, ...(nextStatus ? { status: nextStatus } : {}) },
      });
      updated++;
    } else {
      await db.vehicle.create({ data: { ...data, status: row.status } });
      created++;
    }
  }

  // 4. Full-sync reconciliation: anything from this feed that wasn't in the
  // payload has left the lot → SOLD (RESERVED excluded).
  let markedSold = 0;
  if (complete) {
    const seen = vehicles.map((v) => v.externalId);
    const res = await db.vehicle.updateMany({
      where: {
        feedSource,
        feedExternalId: { notIn: seen },
        status: "AVAILABLE",
      },
      data: { status: "SOLD" },
    });
    markedSold = res.count;
  }

  // 5. Audit the sync as a system action.
  await db.auditLog.create({
    data: {
      userId: null,
      action: "inventory.sync",
      targetType: "Vehicle",
      targetId: feedSource,
      metadata: { created, updated, markedSold, complete, rows: vehicles.length },
    },
  });

  return NextResponse.json({ ok: true, created, updated, markedSold });
}
