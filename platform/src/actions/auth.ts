"use server";

import { z } from "zod";
import { headers } from "next/headers";
import * as argon2 from "argon2";
import { prisma } from "../lib/prisma";
import { setSessionCookie, clearSessionCookie, getSession } from "../lib/session";
import { audit } from "../lib/audit";

/**
 * Staff login / logout server actions (CLAUDE.md §2 IAM).
 *
 * - Passwords: Argon2id (argon2 defaults are Argon2id with sane parameters).
 * - Uniform failure: the same generic error for unknown email, wrong
 *   password, or disabled account — no account enumeration.
 * - A dummy verify runs when the user is unknown so response timing does not
 *   reveal whether the email exists.
 * - Successful and failed logins are audited.
 */

const loginSchema = z.object({
  tenantSlug: z.string().min(1).max(64).regex(/^[a-z0-9-]+$/),
  email: z.string().email().max(254),
  password: z.string().min(8).max(256),
});

// Constant-shaped hash for timing equalisation (hash of a random UUID).
const DUMMY_HASH =
  "$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHRzb21lc2FsdA$6yFxpFYyC1IVdyeWpSXwQrsy6+Ho9puNSHo46VXpjRs";

export type LoginResult =
  | { ok: true; mustChangePassword: boolean }
  | { ok: false; error: string };

export async function login(input: unknown): Promise<LoginResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid credentials." };
  const { tenantSlug, email, password } = parsed.data;

  const user = await prisma.user.findFirst({
    where: {
      email: email.toLowerCase(),
      active: true,
      tenant: { slug: tenantSlug, active: true },
    },
    select: {
      id: true,
      tenantId: true,
      role: true,
      passwordHash: true,
      mustChangePassword: true,
    },
  });

  const hash = user?.passwordHash ?? DUMMY_HASH;
  let valid = false;
  try {
    valid = await argon2.verify(hash, password);
  } catch {
    valid = false;
  }

  if (!user || !valid) {
    if (user) {
      await audit(
        { userId: user.id, tenantId: user.tenantId, role: user.role },
        "auth.login.failed",
        "User",
        user.id,
        { ip: (await headers()).get("x-forwarded-for") }
      );
    }
    return { ok: false, error: "Invalid credentials." };
  }

  await setSessionCookie({ userId: user.id, tenantId: user.tenantId, role: user.role });
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit(
    { userId: user.id, tenantId: user.tenantId, role: user.role },
    "auth.login.success",
    "User",
    user.id,
    { ip: (await headers()).get("x-forwarded-for") }
  );
  // A user provisioned with a temporary password is signed in but the UI
  // must route them straight to the change-password screen; the middleware
  // and layout gate on this flag until changePassword clears it.
  return { ok: true, mustChangePassword: user.mustChangePassword };
}

const changePasswordSchema = z.object({
  currentPassword: z.string().min(8).max(256),
  newPassword: z
    .string()
    .min(12, "New password must be at least 12 characters")
    .max(256)
    .refine((p) => /[a-z]/.test(p) && /[A-Z]/.test(p) && /\d/.test(p), {
      message: "Use upper and lower case letters and at least one number",
    }),
});

export async function changePassword(input: unknown): Promise<LoginResult> {
  const { getSession } = await import("../lib/session");
  const session = await getSession();
  if (!session) return { ok: false, error: "Not signed in." };

  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const { currentPassword, newPassword } = parsed.data;
  if (currentPassword === newPassword) {
    return { ok: false, error: "The new password must be different from the current one." };
  }

  const user = await prisma.user.findFirst({
    where: { id: session.userId, active: true },
    select: { id: true, passwordHash: true },
  });
  if (!user || !(await argon2.verify(user.passwordHash, currentPassword))) {
    return { ok: false, error: "Current password is incorrect." };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await argon2.hash(newPassword, { type: argon2.argon2id }),
      mustChangePassword: false,
    },
  });
  await audit(session, "auth.password.change", "User", user.id, {
    ip: (await headers()).get("x-forwarded-for"),
  });
  return { ok: true, mustChangePassword: false };
}

export async function logout(): Promise<void> {
  const session = await getSession();
  if (session) {
    await audit(session, "auth.logout", "User", session.userId);
  }
  await clearSessionCookie();
}

/** Hash a password for user creation / reset flows. */
export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id });
}
