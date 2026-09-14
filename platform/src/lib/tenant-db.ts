import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

/**
 * Tenant-scoped database access (CLAUDE.md §1 — strict logical isolation).
 *
 * Usage:
 *   const db = tenantDb(session.tenantId);
 *   const cars = await db.vehicle.findMany({ where: { status: "AVAILABLE" } });
 *   // → automatically becomes WHERE tenantId = <tenant> AND status = 'AVAILABLE'
 *
 * Guarantees:
 *  - Every read is AND-ed with { tenantId }: a query can narrow results but
 *    can never widen them across tenants, even if a caller passes a malicious
 *    `where` (including `tenantId: otherTenant` — the AND still pins ours).
 *  - Every create is stamped with our tenantId, overwriting whatever the
 *    caller supplied.
 *  - upsert is pinned on both branches (create data + where).
 *  - AuditLog is append-only: update/delete on it throw.
 *  - `Tenant` model itself is not reachable through this client.
 */

// Models that carry a tenantId column. Keep in sync with schema.prisma —
// the check in scopedArgs throws loudly if an unknown model slips through.
const TENANT_MODELS = new Set([
  "User",
  "Customer",
  "Vehicle",
  "Lead",
  "LeadActivity",
  "TestDrive",
  "Deposit",
  "AuditLog",
]);

const READ_OPS = new Set([
  "findMany",
  "findFirst",
  "findFirstOrThrow",
  "count",
  "aggregate",
  "groupBy",
]);

// findUnique can address a row by a unique key that does not include
// tenantId (e.g. Deposit.stripePaymentIntentId), which would leak across
// tenants. We rewrite it to findFirst so the tenant filter always applies.
const UNIQUE_READ_REWRITE: Record<string, string> = {
  findUnique: "findFirst",
  findUniqueOrThrow: "findFirstOrThrow",
};

const BATCH_WRITE_OPS = new Set(["updateMany", "deleteMany"]);

function pinWhere(args: Record<string, unknown>, tenantId: string) {
  const where = args.where as Record<string, unknown> | undefined;
  args.where = where ? { AND: [{ tenantId }, where] } : { tenantId };
  return args;
}

export function tenantDb(tenantId: string) {
  if (!tenantId || typeof tenantId !== "string") {
    throw new Error("tenantDb: a non-empty tenantId is required");
  }

  return prisma.$extends({
    name: `tenant-scope:${tenantId}`,
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (model === "Tenant") {
            throw new Error(
              "Tenant model is not accessible through tenantDb(); use the admin client."
            );
          }
          if (!TENANT_MODELS.has(model)) {
            throw new Error(
              `tenantDb: model ${model} is not registered as tenant-scoped — update TENANT_MODELS after schema changes.`
            );
          }

          // Immutable audit trail (CLAUDE.md §2, NDB readiness).
          if (
            model === "AuditLog" &&
            /^(update|delete|upsert)/.test(operation)
          ) {
            throw new Error("AuditLog is append-only; updates and deletes are forbidden.");
          }

          const a = (args ?? {}) as Record<string, unknown>;

          if (READ_OPS.has(operation) || BATCH_WRITE_OPS.has(operation)) {
            return query(pinWhere(a, tenantId));
          }

          if (operation in UNIQUE_READ_REWRITE) {
            // Re-dispatch as findFirst/findFirstOrThrow with the tenant pin.
            const target = UNIQUE_READ_REWRITE[operation];
            const delegate = (prisma as unknown as Record<string, any>)[
              model.charAt(0).toLowerCase() + model.slice(1)
            ];
            return delegate[target](pinWhere(a, tenantId));
          }

          if (operation === "create") {
            a.data = { ...(a.data as object), tenantId };
            return query(a);
          }

          if (operation === "createMany" || operation === "createManyAndReturn") {
            const data = a.data;
            a.data = Array.isArray(data)
              ? data.map((d) => ({ ...(d as object), tenantId }))
              : { ...(data as object), tenantId };
            return query(a);
          }

          if (operation === "update" || operation === "delete") {
            // Unique-addressed single-row writes: verify ownership first so a
            // stolen id from another tenant 404s instead of mutating.
            const delegate = (prisma as unknown as Record<string, any>)[
              model.charAt(0).toLowerCase() + model.slice(1)
            ];
            const owned = await delegate.findFirst({
              where: { AND: [{ tenantId }, (a.where as object) ?? {}] },
              select: { id: true },
            });
            if (!owned) {
              throw new Prisma.PrismaClientKnownRequestError(
                `No ${model} found for this tenant.`,
                { code: "P2025", clientVersion: Prisma.prismaVersion.client }
              );
            }
            a.where = { id: owned.id };
            return query(a);
          }

          if (operation === "upsert") {
            const delegate = (prisma as unknown as Record<string, any>)[
              model.charAt(0).toLowerCase() + model.slice(1)
            ];
            const existing = await delegate.findFirst({
              where: { AND: [{ tenantId }, (a.where as object) ?? {}] },
              select: { id: true },
            });
            if (existing) {
              return delegate.update({ where: { id: existing.id }, data: a.update });
            }
            return delegate.create({
              data: { ...(a.create as object), tenantId },
            });
          }

          // Unknown/new operation type: fail closed rather than leak.
          throw new Error(
            `tenantDb: operation ${operation} on ${model} is not covered by the tenant-scoping layer.`
          );
        },
      },
    },
  });
}

export type TenantDb = ReturnType<typeof tenantDb>;
