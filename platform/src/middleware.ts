import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "./lib/session";
import type { Role } from "@prisma/client";

/**
 * Route protection middleware (CLAUDE.md §2 IAM).
 *
 * Verifies the session cookie, extracts tenantId + role, and enforces the
 * role table below before the request reaches any page or API handler.
 * The verified identity is forwarded to handlers via x-rsm-* request headers
 * (set here from the verified JWT — inbound spoofed copies are stripped).
 */

const ROLE_RANK: Record<Role, number> = {
  SALES_REP: 1,
  SALES_MANAGER: 2,
  DEALER_PRINCIPAL: 3,
  SUPER_ADMIN: 4,
};

// Minimum role per route prefix; first match wins (most specific first).
const ROUTE_RULES: Array<{ prefix: string; minRole: Role }> = [
  { prefix: "/admin", minRole: "SUPER_ADMIN" },
  { prefix: "/dashboard/settings", minRole: "DEALER_PRINCIPAL" },
  { prefix: "/dashboard/reports", minRole: "SALES_MANAGER" },
  { prefix: "/dashboard", minRole: "SALES_REP" },
  { prefix: "/api/leads/export", minRole: "SALES_MANAGER" },
  { prefix: "/api/internal", minRole: "SALES_REP" },
];

// Public routes are everything not matched above — storefronts, the lead
// intake endpoint (rate-limited separately), Stripe webhooks (signature-
// verified), and inventory sync (API-key-verified).

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const rule = ROUTE_RULES.find((r) => pathname.startsWith(r.prefix));

  // Never trust identity headers from the outside world.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.delete("x-rsm-user-id");
  requestHeaders.delete("x-rsm-tenant-id");
  requestHeaders.delete("x-rsm-role");

  if (!rule) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;

  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    const login = new URL("/login", req.url);
    login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }

  if (ROLE_RANK[session.role] < ROLE_RANK[rule.minRole]) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  requestHeaders.set("x-rsm-user-id", session.userId);
  requestHeaders.set("x-rsm-tenant-id", session.tenantId);
  requestHeaders.set("x-rsm-role", session.role);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  // Skip static assets; everything else passes through.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|webp|css|js)$).*)"],
};
