# RSMotoCons — Security Report & Threat Model

Date: 2026-09-18. Scope: (1) the **live website** (static pages + `_worker.js`
+ Cloudflare KV message store) and (2) the **platform codebase** in
`platform/` (server-side foundations only — **not deployed**; no database,
no hosting, no users exist for it yet. Its controls are code-reviewed
design, not operating controls, and are marked accordingly).

Honesty rule applied throughout: a control is only called OPERATING if it
runs unconditionally in committed code on the deployed path. Anything that
depends on a dashboard step is NEEDS CONFIG. Anything I cannot observe from
the repository is NOT VERIFIABLE from here.

---

## A. Architecture overview

- **Public site**: static HTML/CSS/JS on Cloudflare Pages, served worldwide
  from Cloudflare's edge. No server of ours, no origin host.
- **Dynamic layer**: one Cloudflare Worker (`_worker.js`, "advanced mode")
  fronting all requests: it serves static assets, injects security headers,
  and implements three API routes (`/api/contact`, `/members/api/leads`,
  `/members/api/leads/delete`).
- **Data store**: one Cloudflare KV namespace (binding `LEADS`) holding
  (a) AES-256-GCM-encrypted contact submissions, (b) plaintext-minimal
  audit entries (no message content), (c) transient rate-limit counters.
- **Members area**: `/members/*`, designed to sit behind Cloudflare Access
  (edge-enforced email + one-time-code login). The members API refuses to
  serve data when Access is absent (`_worker.js → requireMembers`).
- **Platform (future product)**: Next.js/Prisma/PostgreSQL codebase in
  `platform/` — multi-tenant DMS. Not deployed anywhere.

## B. Where customer information is stored

| Data | Location | Encrypted | Notes |
|---|---|---|---|
| Contact-form submissions | Cloudflare KV (`lead:*` keys) | Yes — AES-256-GCM before write (`_worker.js → encryptJson`) | Auto-expire after `RETENTION_DAYS` (default 365) |
| Audit entries | Cloudflare KV (`audit:*` keys) | No (by design: contains ids/actor/IP only, never message content) | Auto-expire after 2 years |
| Anything else | Nowhere | — | The site holds no accounts, cookies, or other customer data. **Nothing is emailed.** |

## C. What is encrypted

- **In transit**: all traffic is HTTPS via Cloudflare (TLS is terminated at
  the edge; there is no origin server to intercept behind it). HSTS is set
  by the worker on every response. NEEDS CONFIG: turn on "Always Use
  HTTPS" and set Minimum TLS Version to 1.2 (dashboard: SSL/TLS → Edge
  Certificates). NOT VERIFIABLE from the repo whether these toggles are on.
- **At rest (application layer)**: every submission is encrypted with
  AES-256-GCM (WebCrypto, random 96-bit IV per message, versioned format)
  *before* it reaches KV — `_worker.js → encryptJson/decryptJson`. A KV
  read without `DATA_KEY` yields ciphertext only.
- **At rest (provider layer)**: Cloudflare encrypts stored data at rest as
  a platform property. NOT VERIFIABLE by us; provider assertion.
- No custom cryptography anywhere — WebCrypto AES-GCM only.

## D. Encryption key management

- `DATA_KEY` (32-byte base64) is **not in source code or Git** — verified:
  the repo contains no key material. It must live as an **encrypted secret**
  in the Pages project (Settings → Environment variables → "Encrypt").
  NEEDS CONFIG: the user must add it (step 4 of setup).
- Rotation: ciphertext carries a version field (`v:1`) so a future key
  rotation can be implemented by re-encrypting; today, changing the key
  orphans old messages (surfaced explicitly in the inbox UI rather than
  failing silently).
- RISK (accepted, documented): the key was generated in this assistant
  session and transmitted in chat to the owner. If that chat is ever
  exposed, rotate the key. For higher assurance, generate a fresh key
  locally (`openssl rand -base64 32`) and never paste it anywhere but the
  Cloudflare secret field.

## E. Authentication architecture

- **Members area (live site)**: Cloudflare Access — email allow-list +
  one-time PIN at Cloudflare's edge, before any request reaches the site.
  No passwords exist on the website at all (nothing to steal, hash, or
  reset). The worker additionally refuses members-API requests that lack
  the Access-stamped JWT header. NEEDS CONFIG: the Zero Trust application
  for `rsmotocons.com/members*` **and** `<project>.pages.dev/members*` is
  not yet created; until it is, the inbox API returns `403 locked` by
  design (`requireMembers`) — data stays closed rather than open.
  NOT VERIFIABLE from the repo: whether the Access app exists yet.
- **Limitation to note**: the worker checks for the *presence* of the
  Access JWT rather than cryptographically validating it against the team's
  public keys (validation requires the team domain, decided at Access
  setup). Cloudflare strips inbound forgeries of these headers at the edge,
  so presence is meaningful — but full JWT verification is the correct
  next hardening step once the team domain exists. FLAGGED as remaining work.
- **Platform (code only, not deployed)**: Argon2id password hashing
  (`platform/src/actions/auth.ts`), uniform login errors + dummy-verify
  against a constant hash to resist user enumeration and timing probes,
  `mustChangePassword` forced rotation on first login, password-complexity
  enforcement in `changePassword`, session as HS256 JWT in an HttpOnly/
  Secure/SameSite=Lax cookie with 8-hour expiry (`src/lib/session.ts`),
  login rate limiting 10/5min/IP (`src/lib/rate-limit.ts`). MFA: not yet
  implemented — REQUIRED before production (checklist item 4/23).
  Password-reset tokens: not yet implemented (admin-issued one-time temp
  passwords exist instead, `src/actions/users.ts`); a self-service reset
  flow with expiring single-use tokens is REQUIRED before production.

## F. Authorisation / RBAC

- **Live site**: two roles only — anonymous (can submit a message) and
  member (can read/delete messages). Enforcement is server-side in the
  worker; nothing relies on hidden buttons. Members are managed as the
  Access email allow-list.
- **Platform (code only)**: four roles (`SUPER_ADMIN`, `DEALER_PRINCIPAL`,
  `SALES_MANAGER`, `SALES_REP`); route-level minimum-role middleware with
  spoofed-identity-header stripping (`src/middleware.ts`); per-action role
  checks in server actions (e.g. invites restricted to principal+ in
  `src/actions/users.ts`); tenant isolation enforced on **every** query by
  the scoped client (`src/lib/tenant-db.ts`) — reads are AND-pinned to the
  tenant, writes ownership-checked first, unknown operations fail closed.

## G. Database exposure

- **Live site**: KV has **no public endpoint at all** — it is reachable
  only from the worker via its binding and from the Cloudflare dashboard
  (protect the Cloudflare account itself with 2FA — NEEDS CONFIG, owner
  action). No connection strings, no ports, nothing to scan.
- **Platform**: PostgreSQL not provisioned yet. The schema/README specify a
  non-public database, least-privilege app role, and
  `REVOKE UPDATE, DELETE` on the audit table. NEEDS CONFIG at provisioning.
- SQL injection: not applicable on the live site (no SQL). Platform uses
  Prisma parameterised queries exclusively; no raw SQL exists in the repo.

## H. API security controls

| Control | `/api/contact` (public) | `/members/api/*` |
|---|---|---|
| AuthN/AuthZ | Public by design (intake) | Access JWT required; 403 otherwise |
| Validation | Type/length caps on every field, email format check, honeypot | `id` must be string with `lead:` prefix |
| Rate limiting | 5/min/IP (KV counter) | Gated by Access; edge rate limiting available as extra (NEEDS CONFIG, optional) |
| CSRF | N/A (no session) | Origin must match host + custom `X-Requested-With` header (cross-site forms/no-cors fetches cannot send it) |
| IDOR/BOLA | N/A | Ids are non-sequential (inverted-timestamp + random UUID slice); single-member trust domain; every request re-checked at edge |
| Errors | Generic messages out; details to platform logs only (`console.error`) | Same |

## I. Security headers

Set by the worker on every response (`_worker.js → withSecurityHeaders`) —
authoritative because advanced mode bypasses `_headers`:
`Strict-Transport-Security` (1y, includeSubDomains, preload) ·
`Content-Security-Policy` (default-src 'self'; script-src 'self' — **no
inline scripts anywhere**; style-src allows inline styles by design;
connect-src 'self'; frame-ancestors 'none'; form-action 'self';
object-src 'none'; base-uri 'self') · `X-Content-Type-Options: nosniff` ·
`X-Frame-Options: DENY` · `Referrer-Policy: strict-origin-when-cross-origin`
· `Permissions-Policy` (camera/mic/geo/payment/usb all off) · COOP/CORP
same-origin · `/members/*` additionally `no-store` + `noindex`.
These are tailored: the site loads no third-party scripts, fonts, or CDNs,
so the CSP allows none.

## J. Secrets management

- Secrets in Git: **none** (checked: no keys, tokens, or passwords in the
  repo; `platform/.gitignore` excludes `.env`; `.env.example` is templates
  only; the seed script takes the admin password from the environment).
- Live secrets: `DATA_KEY` as an encrypted Pages secret (NEEDS CONFIG).
- Platform (future): all via environment (`platform/.env.example` lists
  them); recommend the host's secret manager at deploy time.

## K. Logging / audit architecture

- Worker audit trail (`_worker.js → auditLog`): every submission received,
  every inbox view, every deletion — with timestamp, action, target id,
  result, authenticated member email (from Cloudflare Access), IP, and
  user-agent. **Never** message content, passwords, or tokens.
- Tamper resistance: audit entries live in a separate `audit:` keyspace
  that the members API cannot write or delete; only dashboard access could
  alter them (mitigate with Cloudflare account 2FA + audit of dashboard
  logins, which Cloudflare itself logs). Entries auto-expire after 2 years.
- Platform: immutable `AuditLog` table; append-only enforced in the data
  layer (`tenant-db.ts` rejects update/delete/upsert on it) and to be
  enforced again with DB `REVOKE` at provisioning; staff access to leads,
  test drives, and PII decryption each write entries (`src/lib/audit.ts`,
  `src/actions/leads.ts`), as do logins (success and failure), invites,
  resets, deactivations, and password changes.
- No read endpoint exposes audit entries publicly; today they are readable
  only via the Cloudflare dashboard.

## L. Data minimisation, retention, deletion

Fields collected by the only form on the site:

| Field | Why | Where | Who can access | Retention |
|---|---|---|---|---|
| Name | Address the reply | KV, encrypted | Members only | Until deleted, max `RETENTION_DAYS` (365 default) |
| Email | The only way to reply | KV, encrypted | Members only | Same |
| Pain point (dropdown) | Route the conversation | KV, encrypted | Members only | Same |
| Message | The enquiry itself | KV, encrypted | Members only | Same |
| Marketing opt-in | Spam Act consent proof — **unticked by default**, separate from the operational submission | KV, encrypted | Members only | Same |

Nothing else is collected: no accounts, no phone requirement, no analytics
trackers, no advertising cookies. Deletion: per-message delete in the hub
(audited); automatic expiry via KV TTL; retention window configurable via
the `RETENTION_DAYS` variable without code changes. Backups: we keep none
ourselves — KV durability is Cloudflare-internal, so there are no
developer-downloadable backups to leak (see N/M).

## M. Backup security

Deliberate posture: **no application-level backups of personal data.**
Messages are operational (read → act → delete), not a system of record.
Consequence honestly stated: deleting a message is final, and a Cloudflare
KV loss event would lose undeleted messages. That trade was chosen over
maintaining backup copies of PII to secure. The website code itself is
fully backed up in Git (contains no personal data). The platform, when
provisioned, requires encrypted automated Postgres backups with restricted
access and tested restores — NEEDS CONFIG at provisioning.

## N. Third parties receiving customer information

**Cloudflare only** (hosting, storage, TLS, Access login). No form
service, no analytics, no email provider, no CDN scripts, no fonts. The
earlier Web3Forms integration was removed when storage moved on-site.

## O. Data hosting location

Cloudflare KV replicates globally across Cloudflare's network (primary
copies in Cloudflare core data centres); it is **not** Australia-pinned.
This is an APP 8 (overseas disclosure) consideration — the privacy policy
discloses it (privacy.html §5). If an Australia-only guarantee ever becomes
a requirement, the store must move (e.g. D1/Postgres in an AU region);
flag for legal review.

## P. Remaining vulnerabilities / risks (ranked)

1. **Setup incomplete = controls dormant.** Until the 6 setup steps are
   done (deploy v8+, KV binding, `DATA_KEY`, redeploy, Access lock), the
   form errors out and the inbox stays locked. Fail-closed, but not
   functional. — *Owner action.*
2. **Access JWT presence-checked, not signature-verified** in the worker
   (needs the team domain from setup). Edge stripping makes presence
   meaningful; full verification is the next hardening commit after setup.
3. **Cloudflare account = crown jewels.** Dashboard access can read KV,
   change secrets, and edit the Access allow-list. Mitigation: strong
   unique password + 2FA on the Cloudflare and Gmail accounts. — *Owner action.*
4. **`DATA_KEY` transited chat** (see D). Rotate or regenerate locally if
   concerned.
5. **KV rate-limit counters are not atomic** — a determined attacker can
   slightly exceed 5/min. Impact: spam volume only (storage is capped by
   TTL; nothing else is reachable). Cloudflare WAF/edge rate rules are the
   stronger backstop if abuse appears. — *Optional config.*
6. **No breach *detection* automation**: audit logs support investigation
   (who/what/when), but nobody is alerted on anomalies. Acceptable at this
   scale; revisit at platform launch.
7. **Platform items outstanding before any production deployment**: MFA,
   self-service reset tokens, session revocation store (JWTs are stateless
   — no server-side kill switch yet), dependency scanning in CI, DB
   provisioning hardening, penetration test.

## Q. Items requiring manual configuration (the owner's 6 steps + toggles)

1. Deploy the current zip. 2. Create KV namespace. 3. Bind as `LEADS`.
4. Add `DATA_KEY` encrypted secret. 5. Redeploy. 6. Cloudflare Access on
`/members*` for both hostnames. Then: Always Use HTTPS + Min TLS 1.2
(SSL/TLS settings), 2FA on the Cloudflare account, 2-Step Verification on
Gmail. Optional: edge rate-limit rule on `/api/contact`.

## R. Items requiring legal / privacy review (not a compliance claim)

Controls exist to *support* Privacy Act 1988 / APP obligations; **no claim
of legal compliance is made**. A privacy professional should review:
privacy policy adequacy (APP 1/5), the overseas-hosting analysis for
Cloudflare's global KV (APP 8), retention length appropriateness (APP 11),
the access/correction request procedure (APP 12/13), NDB-scheme response
documentation, and Spam Act consent-record sufficiency. Terms of Use and
the reservation/deposit terms (platform phase) also need legal drafting.

---

## Threat model

| Threat | Outcome with current design |
|---|---|
| External attacker vs. site | Static pages + one worker; no origin server, no SQL, no session cookies to steal on the public site. Attack surface is `/api/contact` (validated, rate-limited, stores only what it encrypts) and Cloudflare itself. |
| Compromised customer account | No customer accounts exist on the site — nothing to compromise. (Platform phase: tenant-scoped, audited.) |
| Compromised member (staff) account | Attacker who controls a member's **email inbox** can pass Access login → read/delete inbox. Every action is audit-logged with their identity and IP; remove the email from the Access policy to revoke instantly. Mitigation: members must secure email with 2FA. |
| Malicious employee | Same visibility as above, fully attributed in the tamper-resistant audit keyspace they cannot edit. |
| Stolen administrator password | No admin passwords exist on the site (Access is passwordless). The real "admin password" is the Cloudflare account → 2FA required (Q). |
| Exposed API key | No API keys exist on the live site. `DATA_KEY` exposure alone ≠ data: an attacker also needs KV read access (Cloudflare account). Rotate on suspicion. |
| Leaked database credentials | No database credentials exist; KV has none. |
| SQL injection | No SQL on the live path. Platform: Prisma-parameterised only. |
| IDOR | Non-sequential random ids; every members request re-authorised at the edge; single trust domain. |
| XSS | CSP forbids inline/external scripts; all user content is inserted via `textContent`-based escaping (`members/hub.js → esc`); form inputs are length-capped server-side. |
| CSRF | Public form: no session to ride. Members API: same-origin check + custom header requirement defeat form/no-cors CSRF. |
| Compromised third-party dependency | The live site has **zero** runtime dependencies — no npm packages, no CDN scripts, nothing to supply-chain. (Platform deps are pinned in `package.json`; add automated scanning before deploy — P7.) |
| Stolen database backup | No backups of personal data exist to steal (M). |
| Cloud storage misconfiguration | No buckets; KV cannot be made public. The classic "open S3 bucket" failure mode has no equivalent here. |

---

### Verdict in one paragraph

For what it is — a marketing site with one encrypted inbox — the design is
deliberately minimal-surface: no origin server, no accounts, no third-party
scripts, no email copies of PII, no backups of PII, application-layer
AES-256-GCM on the only stored personal data, edge-enforced login in front
of the only place it can be read, and an attributed, tamper-resistant audit
trail. Its two honest weak points are operational, not architectural: the
six setup steps are not yet done, and the whole system inherits the
security of two accounts the owner controls (Cloudflare and Gmail) — which
is why 2FA on both is listed as a required step, not advice.
