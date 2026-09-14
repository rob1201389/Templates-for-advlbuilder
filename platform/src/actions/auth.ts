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

export type LoginResult = { ok: true } | { ok: false; error: string };

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
    select: { id: true, tenantId: true, role: true, passwordHash: true },
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
  return { ok: true };
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
