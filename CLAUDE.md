# Project: Automotive SaaS & Dealership Suite (B2B2C)

## 1. System Architecture & Multi-Tenancy
- **Architecture:** B2B2C Multi-Tenant SaaS. Dealerships are "Tenants". Consumers are end-users interacting with Tenant storefronts.
- **Tech Stack:** Next.js (App Router, React Server Components), TypeScript.
- **Database:** PostgreSQL with Prisma ORM.
- **Multi-Tenancy Rule:** STRICT logical isolation. Every database table (except global configs) MUST have a `tenantId`. Every single database query MUST filter by `tenantId` to prevent data bleed between dealerships.
- **Caching & Rate Limiting:** Redis (Upstash).
- **Payments:** Stripe Connect (to route vehicle reservation deposits directly to the respective dealership's Stripe account).

## 2. Security & Australian Compliance (Strict Enforcement)
- **Privacy Act 1988 & APPs (Australian Privacy Principles):**
  - **APP 11 (Security):** Highly sensitive PII (e.g., Driver's License numbers for Test Drives) MUST be encrypted at rest (AES-256) before hitting the database.
  - **Audit Logging (NDB Scheme readiness):** All staff access to consumer PII, lead data, or contract generation must be logged in an immutable `AuditLog` table (User, Action, Timestamp, IP, TargetID).
- **Identity & Access Management (IAM):**
  - Role-Based Access Control (RBAC): `SUPER_ADMIN`, `DEALER_PRINCIPAL`, `SALES_MANAGER`, `SALES_REP`.
  - Session management via HttpOnly, Secure, SameSite=Lax cookies.
- **Spam Act 2003:**
  - Lead generation forms and CRM modules MUST default to "Opt-Out" (unchecked boxes) for marketing.
- **PCI-DSS Compliance:**
  - Raw credit card data must NEVER touch the server. Use Stripe Payment Elements for processing $500 vehicle reservation deposits.

## 3. Core Automotive Modules
1. **Inventory Management (CMS) & Aggregation:**
   - Schema for `Vehicle`: VIN, Rego, Stock Number, Make, Model, Year, Body Type, Transmission, Odometer, Price, Status (Available, Reserved, Sold).
   - Webhook endpoints to ingest inventory XML/JSON feeds from third parties.
2. **Lead Management System (LMS):**
   - Centralized schema for `Lead`: Source (Chatbot, Web Form, Carsales), Status (New, Contacted, Converted, Lost), Assigned To (`userId`), Activity Timeline.
3. **Test Drive & Loan Management:**
   - Schema supporting digital ID capture (secure temporary AWS S3 URLs) and calendar scheduling to prevent double bookings.

## 4. Coding Standards
- **Validation:** Use Zod for strict schema validation on EVERY API route and Server Action. Trust no client input.
- **Security Headers:** Strict Content Security Policy (CSP), X-Frame-Options, and CORS configurations.
- **Monetary Values:** All prices and deposits must be stored in the database as integer cents (`AUD_cents`).

## 5. Repository Layout
- Root: the public marketing website for rsmotocons.com (static, deployed on Cloudflare Pages — no build step).
- `platform/`: the SaaS product itself (database schema, tenant isolation utilities, and — as it grows — the Next.js application).
