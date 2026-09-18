/**
 * RSMotoCons info@ inbox — catcher + admin-only reader.
 *
 * A standalone Cloudflare Worker, deliberately separate from the main site
 * worker (white-rice-f5cc) so it can be deployed and rolled back on its own
 * without ever touching the live site.
 *
 * - email():  Cloudflare Email Routing delivers mail to info@rsmotocons.com
 *             here. It is parsed, encrypted with AES-256-GCM using INBOX_KEY,
 *             and written to the shared LEADS KV under the `inbox:` prefix
 *             (kept separate from the site's `lead:` contact-form messages).
 * - fetch():  the private reader, served on inbox.rsmotocons.com, which is
 *             protected at the edge by Cloudflare Access (Google login) and
 *             restricted to the admin. This worker double-checks the Access
 *             identity header against ADMIN_EMAILS before showing anything.
 *
 * Bindings (see wrangler.jsonc):
 *   KV:      LEADS      → same namespace the site already uses
 *   Secret:  INBOX_KEY  → base64 32-byte key
 *   Vars:    ADMIN_EMAILS (comma-separated), ORG_NAME, INBOX_RETENTION_DAYS
 */

import PostalMime from "postal-mime";

const CSP =
  "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; " +
  "frame-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      // Everything here is behind Cloudflare Access; re-check identity anyway.
      const who = adminIdentity(request, env);
      if (!who) return page(403, "Not authorised", notAuthorisedBody(request, env));

      if (request.method === "POST" && url.pathname === "/delete") {
        return await handleDelete(request, env, who);
      }
      if (request.method === "GET" && url.pathname === "/") {
        return await renderInbox(request, env, who);
      }
      // Sanitised email HTML, served for embedding in a sandboxed iframe.
      if (request.method === "GET" && url.pathname === "/msg-html") {
        return await renderMsgHtml(request, env);
      }
      return page(404, "Not found", "<p>Nothing here.</p>");
    } catch (err) {
      console.error("reader error:", err && err.message);
      return page(500, "Error", "<p>Something went wrong reading the inbox.</p>");
    }
  },

  async email(message, env) {
    try {
      await storeMessage(message, env);
    } catch (err) {
      console.error("inbox capture failed:", err && err.message);
    }
  },
};

/* ───────────── identity / admin gate ───────────── */

function adminList(env) {
  return (env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Returns the signed-in admin email, or "" if the caller isn't an allowed admin. */
function adminIdentity(request, env) {
  const hasAccess = request.headers.get("cf-access-jwt-assertion");
  const email = (request.headers.get("cf-access-authenticated-user-email") || "").toLowerCase();
  if (!hasAccess || !email) return "";
  return adminList(env).includes(email) ? email : "";
}

/* ───────────── reader UI ───────────── */

async function renderInbox(request, env, who) {
  const list = await env.LEADS.list({ prefix: "inbox:", limit: 500 });
  const rows = [];
  for (const k of list.keys) {
    const stored = await env.LEADS.get(k.name);
    if (!stored) continue;
    try {
      const m = await decryptJson(env, stored);
      rows.push({ id: k.name, ...m });
    } catch {
      rows.push({ id: k.name, subject: "(cannot decrypt)", from: "", date: "", text: "" });
    }
  }
  await auditLog(env, { action: "inbox.view", actor: who, result: `ok:${rows.length}` });

  const body = `
    <header class="bar">
      <div>
        <h1>info@ inbox</h1>
        <p class="sub">${rows.length} message${rows.length === 1 ? "" : "s"} · signed in as ${esc(who)}</p>
      </div>
    </header>
    ${rows.length === 0 ? `<p class="empty">No messages yet. Mail sent to <strong>info@rsmotocons.com</strong> will appear here.</p>` : ""}
    <ul class="list">
      ${rows.map((m) => messageItem(m)).join("")}
    </ul>`;
  return page(200, "info@ inbox", body);
}

function messageItem(m) {
  const when = fmtDate(m.date || m.receivedAt);
  const fromLine = m.fromName ? `${m.fromName} <${m.from}>` : m.from || "(unknown sender)";
  const atts = (m.attachments || []).length
    ? `<p class="atts">📎 ${m.attachments.map((a) => `${esc(a.name)} (${fmtSize(a.size)})`).join(", ")}</p>`
    : "";
  return `
    <li class="msg">
      <details>
        <summary>
          <span class="s-subj">${esc(m.subject || "(no subject)")}</span>
          <span class="s-meta">${esc(fromLine)} · ${esc(when)}</span>
        </summary>
        <div class="mbody">
          <table class="meta">
            <tr><th>From</th><td>${esc(fromLine)}</td></tr>
            <tr><th>To</th><td>${esc(m.to || "")}</td></tr>
            <tr><th>Date</th><td>${esc(when)}</td></tr>
            <tr><th>Subject</th><td>${esc(m.subject || "(no subject)")}</td></tr>
          </table>
          ${atts}
          ${m.html
            ? `<iframe class="eml" loading="lazy"
                 sandbox="allow-popups allow-popups-to-escape-sandbox"
                 src="/msg-html?id=${encodeURIComponent(m.id)}"
                 title="Formatted email"></iframe>
               <details class="plain"><summary>Show plain text</summary><pre class="text">${esc(m.text || "(no plain-text body)")}</pre></details>`
            : `<pre class="text">${esc(m.text || "(no plain-text body)")}</pre>`}
          <form method="POST" action="/delete" onsubmit="return confirm('Delete this message permanently?')">
            <input type="hidden" name="id" value="${esc(m.id)}">
            <button class="del" type="submit">Delete</button>
          </form>
        </div>
      </details>
    </li>`;
}

async function handleDelete(request, env, who) {
  // CSRF: only accept same-origin form posts.
  const origin = request.headers.get("origin");
  const url = new URL(request.url);
  if (origin && origin !== url.origin) return page(403, "Forbidden", "<p>Bad origin.</p>");

  const form = await request.formData();
  const id = String(form.get("id") || "");
  if (!id.startsWith("inbox:")) return page(400, "Bad request", "<p>Invalid id.</p>");
  await env.LEADS.delete(id);
  await auditLog(env, { action: "inbox.delete", actor: who, target: id, result: "ok" });
  return Response.redirect(url.origin + "/", 303);
}

function notAuthorisedBody(request, env) {
  const email = esc(request.headers.get("cf-access-authenticated-user-email") || "unknown");
  return `<p>You are signed in as <strong>${email}</strong>, which is not permitted to view the info@ inbox.</p>
          <p>This inbox is restricted to the administrator.</p>`;
}

/**
 * Serves a single message's HTML body, sanitised, as a standalone document.
 * It is embedded by the inbox page inside a sandboxed iframe (no scripts, no
 * same-origin), and this response also carries a script-free CSP — so email
 * markup renders (formatting, images) but nothing in it can execute.
 * Reachable only by the admin (the whole worker is gated in fetch()).
 */
async function renderMsgHtml(request, env) {
  const id = new URL(request.url).searchParams.get("id") || "";
  if (!id.startsWith("inbox:")) return new Response("Bad id", { status: 400 });
  const stored = await env.LEADS.get(id);
  if (!stored) return htmlFrame("<p>Message not found.</p>");
  let m;
  try {
    m = await decryptJson(env, stored);
  } catch {
    return htmlFrame("<p>Cannot decrypt this message.</p>");
  }
  const safe = sanitizeHtml(m.html || "");
  const inner = safe || `<pre>${esc(m.text || "(no content)")}</pre>`;
  return htmlFrame(inner);
}

function htmlFrame(inner) {
  const doc = `<!DOCTYPE html><html><head><meta charset="utf-8">
<base target="_blank">
<style>
  html,body{margin:0;padding:14px;background:#fff;color:#16181d;
    font:15px/1.55 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
    word-wrap:break-word;overflow-wrap:break-word;}
  img{max-width:100%;height:auto;}
  table{max-width:100%;}
  pre{white-space:pre-wrap;word-wrap:break-word;}
  a{color:#1155cc;}
</style></head><body>${inner}</body></html>`;
  return new Response(doc, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // No script-src at all: even if a <script> slipped past the sanitiser it can't run.
      "Content-Security-Policy":
        "default-src 'none'; img-src * data: https:; style-src 'unsafe-inline'; " +
        "font-src * data:; media-src *; frame-ancestors 'self'",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Cache-Control": "no-store",
    },
  });
}

/**
 * Conservative HTML sanitiser (defence-in-depth alongside the iframe sandbox
 * and script-free CSP). Strips executable/embedding elements, inline event
 * handlers, and script-y URLs. Keeps layout markup, inline styles and images.
 */
function sanitizeHtml(html) {
  if (!html) return "";
  let s = String(html);
  s = s.replace(/<!--[\s\S]*?-->/g, "");
  // Remove dangerous elements with their content.
  s = s.replace(
    /<\s*(script|style|iframe|object|embed|link|meta|base|form|frameset|frame|noscript|template)\b[\s\S]*?<\s*\/\s*\1\s*>/gi,
    ""
  );
  // Remove any stray opening/self-closing forms of those elements.
  s = s.replace(
    /<\s*\/?\s*(script|iframe|object|embed|link|meta|base|form|frameset|frame|noscript|template)\b[^>]*>/gi,
    ""
  );
  // Strip on*= event-handler attributes (quoted and unquoted).
  s = s.replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "");
  s = s.replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "");
  s = s.replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "");
  // Neutralise javascript:/vbscript:/text-html-data URLs in href/src.
  s = s.replace(
    /((?:href|src|xlink:href)\s*=\s*)("|')\s*(?:javascript|vbscript|data:text\/html)[^"']*\2/gi,
    '$1$2#$2'
  );
  return s;
}

/* ───────────── page shell ───────────── */

function page(status, title, bodyHtml) {
  const html = `<!DOCTYPE html>
<html lang="en-AU"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)} — RSMotoCons</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { margin:0; font:16px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
         background:#f4f5f7; color:#16181d; }
  @media (prefers-color-scheme: dark){ body{ background:#0f1115; color:#e7e9ee; } }
  .wrap { max-width: 820px; margin: 0 auto; padding: 24px 16px 64px; }
  .bar { display:flex; align-items:center; justify-content:space-between; gap:16px;
         padding-bottom:16px; border-bottom:2px solid #d21b3a; margin-bottom:20px; }
  h1 { font-size:1.5rem; margin:0; }
  .sub { margin:4px 0 0; color:#6a7180; font-size:.9rem; }
  .empty { color:#6a7180; padding:32px 0; }
  ul.list { list-style:none; margin:0; padding:0; }
  li.msg { background:#fff; border:1px solid #e2e5ea; border-radius:10px; margin-bottom:10px; overflow:hidden; }
  @media (prefers-color-scheme: dark){ li.msg{ background:#171a21; border-color:#262b35; } }
  summary { cursor:pointer; padding:14px 16px; display:flex; flex-direction:column; gap:2px; }
  summary::-webkit-details-marker { display:none; }
  .s-subj { font-weight:600; }
  .s-meta { color:#6a7180; font-size:.85rem; }
  .mbody { padding: 4px 16px 16px; border-top:1px solid #eceef2; }
  @media (prefers-color-scheme: dark){ .mbody{ border-color:#262b35; } }
  table.meta { width:100%; border-collapse:collapse; margin:12px 0; font-size:.9rem; }
  table.meta th { text-align:left; width:70px; color:#6a7180; font-weight:600; vertical-align:top; padding:2px 8px 2px 0; }
  pre.text { white-space:pre-wrap; word-wrap:break-word; background:#f7f8fa; border:1px solid #eceef2;
             border-radius:8px; padding:12px; font:14px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace; overflow-x:auto; }
  @media (prefers-color-scheme: dark){ pre.text{ background:#0f1218; border-color:#262b35; } }
  iframe.eml { width:100%; height:560px; border:1px solid #e2e5ea; border-radius:8px;
               background:#fff; margin:12px 0; display:block; }
  @media (prefers-color-scheme: dark){ iframe.eml{ border-color:#262b35; } }
  details.plain { margin:2px 0 4px; }
  details.plain summary { cursor:pointer; color:#6a7180; font-size:.85rem; }
  .atts { font-size:.9rem; color:#444; }
  button.del { margin-top:12px; background:#d21b3a; color:#fff; border:0; border-radius:8px;
               padding:8px 14px; font-size:.9rem; cursor:pointer; }
  button.del:hover { background:#b01730; }
</style></head>
<body><div class="wrap">${bodyHtml}</div></body></html>`;
  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": CSP,
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "no-referrer",
    },
  });
}

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function fmtDate(d) {
  if (!d) return "";
  const t = new Date(d);
  return isNaN(t) ? String(d) : t.toLocaleString("en-AU", { timeZone: "Australia/Sydney" });
}
function fmtSize(n) {
  n = n || 0;
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(0) + " KB";
  return (n / 1024 / 1024).toFixed(1) + " MB";
}

/* ───────────── email capture ───────────── */

async function storeMessage(message, env) {
  if (!env.LEADS) throw new Error("LEADS KV not bound");
  if (!env.INBOX_KEY) throw new Error("INBOX_KEY missing");

  const parsed = await PostalMime.parse(message.raw);
  const record = {
    type: "email",
    envelopeFrom: message.from || "",
    envelopeTo: message.to || "",
    from: (parsed.from && parsed.from.address) || message.from || "",
    fromName: (parsed.from && parsed.from.name) || "",
    to: Array.isArray(parsed.to)
      ? parsed.to.map((t) => t.address).filter(Boolean).join(", ")
      : message.to || "",
    subject: (parsed.subject || "(no subject)").slice(0, 500),
    date: parsed.date || new Date().toISOString(),
    text: (parsed.text || "").slice(0, 100000),
    html: (parsed.html || "").slice(0, 200000),
    attachments: (parsed.attachments || []).map((a) => ({
      name: a.filename || "attachment",
      type: a.mimeType || "application/octet-stream",
      size: a.content ? a.content.byteLength || 0 : 0,
    })),
    messageId: (parsed.messageId || "").slice(0, 400),
    receivedAt: new Date().toISOString(),
  };

  const invTs = String(1e13 - Date.now()).padStart(13, "0");
  const id = `inbox:${invTs}:${crypto.randomUUID().slice(0, 8)}`;
  await env.LEADS.put(id, await encryptJson(env, record), {
    expirationTtl: retentionSeconds(env),
  });
  await auditLog(env, { action: "inbox.received", target: id, result: "ok", from: record.from });
}

function retentionSeconds(env) {
  const days = parseInt(env.INBOX_RETENTION_DAYS || "730", 10);
  return (isNaN(days) || days < 1 ? 730 : days) * 24 * 60 * 60;
}

async function auditLog(env, entry) {
  try {
    const invTs = String(1e13 - Date.now()).padStart(13, "0");
    await env.LEADS.put(
      `audit:${invTs}:${crypto.randomUUID().slice(0, 8)}`,
      JSON.stringify({ at: new Date().toISOString(), source: "inbox-worker", ...entry }),
      { expirationTtl: 60 * 60 * 24 * 730 }
    );
  } catch (e) {
    console.error("audit write failed:", e && e.message);
  }
}

/* ───────────── crypto (AES-256-GCM) ───────────── */

async function getKey(env) {
  const raw = Uint8Array.from(atob(env.INBOX_KEY), (c) => c.charCodeAt(0));
  if (raw.length !== 32) throw new Error("INBOX_KEY must be 32 bytes base64");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function encryptJson(env, obj) {
  const key = await getKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key,
    new TextEncoder().encode(JSON.stringify(obj)));
  return JSON.stringify({
    v: 1,
    iv: btoa(String.fromCharCode(...iv)),
    ct: btoa(String.fromCharCode(...new Uint8Array(ct))),
  });
}
async function decryptJson(env, stored) {
  const key = await getKey(env);
  const { iv, ct } = JSON.parse(stored);
  const ivB = Uint8Array.from(atob(iv), (c) => c.charCodeAt(0));
  const ctB = Uint8Array.from(atob(ct), (c) => c.charCodeAt(0));
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: ivB }, key, ctB);
  return JSON.parse(new TextDecoder().decode(pt));
}
