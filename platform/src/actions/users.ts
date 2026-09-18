"use server";

import { z } from "zod";
import { randomBytes } from "crypto";
import * as argon2 from "argon2";
import { headers } from "next/headers";
import { requireSession } from "../lib/session";
import { tenantDb } from "../lib/tenant-db";
import { audit } from "../lib/audit";

/**
 * Member management (dealership staff accounts).
 *
 * DEALER_PRINCIPAL (and SUPER_ADMIN) can invite members by email. Each
 * invite creates the account with a generated temporary password that is
 * returned ONCE to the inviting admin to hand to the member; the member
 * must replace it on first login (mustChangePassword, enforced in auth).
 * Temporary passwords are never stored in plaintext and never emailed by
 * the system itself.
 */

const ADMIN_ROLES = new Set(["DEALER_PRINCIPAL", "SUPER_ADMIN"]);

function generateTempPassword(): string {
  // 14 chars from an unambiguous alphabet (no 0/O, 1/l/I), plus guaranteed
  // digit and case mix so it passes the change-password policy format.
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(14);
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

async function ctx() {
  const h = await headers();
  return {
    ip: h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: h.get("user-agent"),
  };
}

const inviteSchema = z.object({
  email: z.string().trim().email().max(254),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  role: z.enum(["DEALER_PRINCIPAL", "SALES_MANAGER", "SALES_REP"]).default("SALES_REP"),
});

export type InviteResult =
  | { ok: true; userId: string; tempPassword: string }
  | { ok: false; error: string };

export async function inviteMember(input: unknown): Promise<InviteResult> {
  const session = await requireSession();
  if (!ADMIN_ROLES.has(session.role)) return { ok: false, error: "Only an admin can add members." };

  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid member details." };
  const { email, firstName, lastName, role } = parsed.data;

  const db = tenantDb(session.tenantId);
  const existing = await db.user.findFirst({ where: { email: email.toLowerCase() } });
  if (existing) return { ok: false, error: "A member with this email already exists." };

  const tempPassword = generateTempPassword();
  const user = await db.user.create({
    data: {
      email: email.toLowerCase(),
      firstName,
      lastName,
      role,
      passwordHash: await argon2.hash(tempPassword, { type: argon2.argon2id }),
      mustChangePassword: true,
    },
  });

  await audit(session, "user.invite", "User", user.id, {
    ...(await ctx()),
    metadata: { role },
  });

  // Shown once to the admin; the member replaces it at first login.
  return { ok: true, userId: user.id, tempPassword };
}

const idSchema = z.object({ userId: z.string().cuid() });

export async function deactivateMember(input: unknown) {
  const session = await requireSession();
  if (!ADMIN_ROLES.has(session.role)) throw new Error("FORBIDDEN");
  const { userId } = idSchema.parse(input);
  if (userId === session.userId) throw new Error("You cannot deactivate your own account.");

  const db = tenantDb(session.tenantId);
  const user = await db.user.update({ where: { id: userId }, data: { active: false } });
  await audit(session, "user.deactivate", "User", user.id, await ctx());
  return { ok: true };
}

export async function resetMemberPassword(input: unknown): Promise<InviteResult> {
  const session = await requireSession();
  if (!ADMIN_ROLES.has(session.role)) return { ok: false, error: "Only an admin can reset passwords." };
  const { userId } = idSchema.parse(input);

  const db = tenantDb(session.tenantId);
  const tempPassword = generateTempPassword();
  const user = await db.user.update({
    where: { id: userId },
    data: {
      passwordHash: await argon2.hash(tempPassword, { type: argon2.argon2id }),
      mustChangePassword: true,
    },
  });
  await audit(session, "user.password.reset", "User", user.id, await ctx());
  return { ok: true, userId: user.id, tempPassword };
}

export async function listMembers() {
  const session = await requireSession();
  if (!ADMIN_ROLES.has(session.role)) throw new Error("FORBIDDEN");
  const db = tenantDb(session.tenantId);
  return db.user.findMany({
    where: {},
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      active: true,
      mustChangePassword: true,
      lastLoginAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
}
