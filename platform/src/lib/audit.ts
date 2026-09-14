import { tenantDb } from "./tenant-db";
import type { SessionPayload } from "./session";

/**
 * AuditLogger (CLAUDE.md §2 — NDB scheme readiness).
 *
 * Writes an immutable AuditLog row for every sensitive access. The tenantDb
 * layer forbids updates/deletes on AuditLog; production should additionally
 * REVOKE UPDATE, DELETE on the table from the app's DB role.
 *
 * Convention for `action`: "<target>.<operation>", e.g.
 *   lead.view, lead.export, testdrive.view, customer.pii.view,
 *   contract.generate, deposit.refund
 */

export interface AuditContext {
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}

export async function audit(
  session: SessionPayload,
  action: string,
  targetType: string,
  targetId: string,
  ctx: AuditContext = {}
): Promise<void> {
  const db = tenantDb(session.tenantId);
  await db.auditLog.create({
    data: {
      userId: session.userId,
      action,
      targetType,
      targetId,
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
      metadata: ctx.metadata as object | undefined,
    },
  });
}

/**
 * Wrap a record fetch so that SALES_REP / SALES_MANAGER access to Lead and
 * TestDrive data is always logged (per CLAUDE.md §2). DEALER_PRINCIPAL and
 * SUPER_ADMIN access is logged too — broader logging is never wrong for NDB
 * readiness; the requirement names reps and managers as the minimum.
 */
export async function auditedAccess<T>(
  session: SessionPayload,
  targetType: "Lead" | "TestDrive",
  targetId: string,
  ctx: AuditContext,
  fetcher: () => Promise<T>
): Promise<T> {
  const result = await fetcher();
  await audit(session, `${targetType.toLowerCase()}.view`, targetType, targetId, ctx);
  return result;
}

/** Pull ip / user-agent out of a Request for audit context. */
export function auditCtxFromRequest(req: Request): AuditContext {
  const h = req.headers;
  return {
    ip:
      h.get("cf-connecting-ip") ??
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      null,
    userAgent: h.get("user-agent"),
  };
}
