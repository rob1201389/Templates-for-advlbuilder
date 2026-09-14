# RSMotoCons Platform

The dealer management SaaS behind rsmotocons.com — a B2B2C multi-tenant
system where each dealership is an isolated tenant. See the repo-root
`CLAUDE.md` for the full architecture and compliance rules.

## What's implemented so far

| Layer | Files | Status |
|---|---|---|
| Database schema (Prisma/PostgreSQL) | `prisma/schema.prisma` | ✅ Tenant, User+RBAC, Customer, Vehicle, Lead(+Activity), TestDrive, Deposit, AuditLog |
| Tenant isolation | `src/lib/tenant-db.ts` | ✅ Every query auto-pinned to tenantId; AuditLog append-only |
| Auth & sessions | `src/actions/auth.ts`, `src/lib/session.ts` | ✅ Argon2id, HttpOnly/Secure/Lax JWT cookie, no account enumeration |
| RBAC middleware | `src/middleware.ts` | ✅ Role-ranked route table, identity-header spoof stripping |
| Audit logging | `src/lib/audit.ts` | ✅ Rep/manager access to Lead & TestDrive always logged (NDB-ready) |
| Lead intake API | `src/app/api/leads/route.ts` | ✅ Zod validation, Upstash rate limiting (fail-closed), Spam Act opt-in |
| Staff LMS actions | `src/actions/leads.ts` | ✅ Audited reads, separately-audited licence decryption |
| PII encryption | `src/lib/crypto.ts` | ✅ AES-256-GCM, versioned ciphertext (APP 11) |
| Deposits (Stripe Connect) | `src/actions/deposits.ts`, `src/app/api/webhooks/stripe/route.ts` | ✅ Atomic vehicle lock, signature-verified webhook, idempotent |
| Tax invoices | `src/lib/invoice.ts` | ✅ ATO-style GST invoice PDF → private S3 (SSE) |
| Inventory sync | `src/app/api/inventory/sync/route.ts` | ✅ Hashed API keys, Zod, upsert, missing→SOLD reconciliation |

## Not yet built

- Next.js app scaffold (pages/UI) — these are the server-side foundations
- Stripe Connect onboarding flow for tenants
- Customer-facing storefront and chatbot
- Test-drive calendar UI and S3 signed-URL ID capture
- Database migrations run against a live PostgreSQL

## Getting it running (when ready)

```bash
cd platform
cp .env.example .env   # fill in every value
npm install
npx prisma migrate dev # creates the database schema
npm run dev
```

Production hardening checklist:
- `REVOKE UPDATE, DELETE ON "AuditLog" FROM app_role;` (DB-level immutability)
- Rotate `PII_ENCRYPTION_KEY` via the ciphertext version prefix
- Stripe webhook endpoint registered with the `checkout.session.completed`
  and `checkout.session.expired` events only
- Invoice bucket: private ACL, SSE, per-tenant prefix IAM conditions
