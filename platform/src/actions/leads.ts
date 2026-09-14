"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { requireSession } from "../lib/session";
import { tenantDb } from "../lib/tenant-db";
import { audit, auditedAccess } from "../lib/audit";

/**
 * Staff-facing LMS server actions (Prompt 3).
 *
 * Every action re-derives tenant scope from the verified session — never
 * from arguments — and sensitive reads flow through auditedAccess so rep /
 * manager access to Lead and TestDrive data always lands in the AuditLog.
 */

async function auditCtx() {
  const h = await headers();
  return {
    ip: h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: h.get("user-agent"),
  };
}

const idSchema = z.string().cuid();

export async function getLead(leadIdInput: unknown) {
  const session = await requireSession();
  const leadId = idSchema.parse(leadIdInput);
  const db = tenantDb(session.tenantId);

  return auditedAccess(session, "Lead", leadId, await auditCtx(), () =>
    db.lead.findFirst({
      where: { id: leadId },
      include: {
        customer: true,
        vehicle: true,
        assignedTo: { select: { id: true, firstName: true, lastName: true, role: true } },
        activities: { orderBy: { createdAt: "desc" }, take: 50 },
      },
    })
  );
}

export async function getTestDrive(testDriveIdInput: unknown) {
  const session = await requireSession();
  const testDriveId = idSchema.parse(testDriveIdInput);
  const db = tenantDb(session.tenantId);

  return auditedAccess(session, "TestDrive", testDriveId, await auditCtx(), () =>
    db.testDrive.findFirst({
      where: { id: testDriveId },
      include: { customer: true, vehicle: true },
      // NOTE: driversLicenceEncrypted stays encrypted here. Decryption is a
      // separate, separately-audited action below.
    })
  );
}

/** Decrypt a licence number for a legitimate need (e.g. pre-drive check). */
export async function revealTestDriveLicence(testDriveIdInput: unknown) {
  const session = await requireSession();
  const testDriveId = idSchema.parse(testDriveIdInput);
  const db = tenantDb(session.tenantId);

  const td = await db.testDrive.findFirst({
    where: { id: testDriveId },
    select: { id: true, driversLicenceEncrypted: true },
  });
  if (!td?.driversLicenceEncrypted) return null;

  await audit(session, "customer.pii.view", "TestDrive", td.id, {
    ...(await auditCtx()),
    metadata: { field: "driversLicence" },
  });

  const { decryptPii } = await import("../lib/crypto");
  return decryptPii(td.driversLicenceEncrypted);
}

const updateStatusSchema = z.object({
  leadId: idSchema,
  status: z.enum(["NEW", "CONTACTED", "CONVERTED", "LOST"]),
  note: z.string().trim().max(2000).optional(),
});

export async function updateLeadStatus(input: unknown) {
  const session = await requireSession();
  const { leadId, status, note } = updateStatusSchema.parse(input);
  const db = tenantDb(session.tenantId);

  const lead = await db.lead.update({ where: { id: leadId }, data: { status } });
  await db.leadActivity.create({
    data: {
      leadId: lead.id,
      userId: session.userId,
      kind: "status_change",
      body: note ?? `Status → ${status}`,
    },
  });
  await audit(session, "lead.status.update", "Lead", lead.id, {
    ...(await auditCtx()),
    metadata: { status },
  });
  return lead;
}

const assignSchema = z.object({ leadId: idSchema, userId: idSchema });

export async function assignLead(input: unknown) {
  const session = await requireSession();
  if (session.role === "SALES_REP") throw new Error("FORBIDDEN"); // managers and up
  const { leadId, userId } = assignSchema.parse(input);
  const db = tenantDb(session.tenantId);

  // Assignee must belong to the same tenant — scoped lookup guarantees it.
  const assignee = await db.user.findFirst({ where: { id: userId, active: true } });
  if (!assignee) throw new Error("Assignee not found in this dealership");

  const lead = await db.lead.update({
    where: { id: leadId },
    data: { assignedToId: assignee.id },
  });
  await audit(session, "lead.assign", "Lead", lead.id, {
    ...(await auditCtx()),
    metadata: { assignedToId: assignee.id },
  });
  return lead;
}
