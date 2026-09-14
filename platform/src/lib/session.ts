import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { Role } from "@prisma/client";

/**
 * Staff session management (CLAUDE.md §2 IAM).
 *
 * Sessions are short-lived signed JWTs carried in an HttpOnly, Secure,
 * SameSite=Lax cookie. No session content is readable or writable from
 * client-side JS. Rotation happens on every login; logout clears the cookie.
 */

export const SESSION_COOKIE = "rsm_session";
const SESSION_TTL_SECONDS = 60 * 60 * 8; // one working day

export interface SessionPayload {
  userId: string;
  tenantId: string;
  role: Role;
}

function secret(): Uint8Array {
  const raw = process.env.SESSION_SECRET;
  if (!raw || raw.length < 32) {
    throw new Error("SESSION_SECRET must be set and at least 32 characters");
  }
  return new TextEncoder().encode(raw);
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .setIssuer("rsmotocons-platform")
    .sign(secret());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), {
      issuer: "rsmotocons-platform",
    });
    const { userId, tenantId, role } = payload as Record<string, unknown>;
    if (typeof userId !== "string" || typeof tenantId !== "string" || typeof role !== "string") {
      return null;
    }
    return { userId, tenantId, role: role as Role };
  } catch {
    return null;
  }
}

export async function setSessionCookie(payload: SessionPayload): Promise<void> {
  const token = await createSessionToken(payload);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

/** Read + verify the current request's session (server components / actions). */
export async function getSession(): Promise<SessionPayload | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

/** Throw-if-absent variant for server actions that require auth. */
export async function requireSession(): Promise<SessionPayload> {
  const s = await getSession();
  if (!s) throw new Error("UNAUTHENTICATED");
  return s;
}
