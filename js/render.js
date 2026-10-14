/* ============================================================
   Canvas rendering engine — built on the Toyota Masterbrand
   Guidelines v8 (section 14 Advertising, 15 Dealerships, 17
   Social media). Key rules implemented here:

   - Toyota Product VERTICAL logo on all paid communications,
     never duplicated, sized from the layout per 14.5, with
     margins of ~40% logo height. Alignment left/centre/right;
     text follows logo alignment (14.6).
   - Dealership appears as TEXT: optional dealer tag header at
     top and/or sign-off (name + details) at the base, read
     before OWAF (15.7). Composite lockups are reserved for
     restricted-space/identity uses (15.2) and are not placed
     on standard layouts.
   - OWAF tagline supports the logo on all paid comms, sits at
     the base at 175% of the Toyota logo width; red on white,
     white on black/imagery (14.5, 14.7).
   - Disclaimers under OWAF at the very base (14.8).
   - Layout families: full-bleed image / colour background
     (white, black, red only — never grey) / strip (white, red
     or black band on any edge, 30–60% with imagery) (14.2-14.4).
   - Text holders (red roundel, pill, rounded square) may focus
     attention on offers (14.11); red backgrounds pair with
     black devices (14.4).
   - CTA styles: red pill / text-only uppercase / sentence case
     with arrow (14.7, 14.17).
   - Organic social image posts carry NO branding (17.3/17.4);
     paid placements carry the full furniture.
   ============================================================ */

const FONT_STACK = `"BrandFont","Toyota Type",Arial,"Helvetica Neue",sans-serif`;

function F(px, weight = 800) {
  return `${weight} ${Math.round(px)}px ${FONT_STACK}`;
}

function tok(str, s) {
  if (!str) return "";
  return str
    .replaceAll("{MODEL}", (s.model || "").toUpperCase())
    .replaceAll("{GRADE}", (s.grade || "").toUpperCase())
    .replaceAll("{COLOUR}", s.colour || "")
    .replaceAll("{PRICE}", s.price || "")
    .replaceAll("{DEALER}", s.dealer || "");
}

/* ---------------- shared low-level helpers ---------------- */

function drawCover(ctx, img, x, y, w, h, fx = 0.5, fy = 0.5) {
  const ir = img.width / img.height, rr = w / h;
  let sw, sh;
  if (ir > rr) { sh = img.height; sw = sh * rr; }
  else { sw = img.width; sh = sw / rr; }
  ctx.drawImage(img, (img.width - sw) * fx, (img.height - sh) * fy, sw, sh, x, y, w, h);
}

function fitText(ctx, text, maxWidth, basePx, weight = 800, minPx = 8) {
  let px = basePx;
  ctx.font = F(px, weight);
  while (px > minPx && ctx.measureText(text).width > maxWidth) {
    px -= Math.max(1, px * 0.04);
    ctx.font = F(px, weight);
  }
  return px;
}

function wrapText(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = w; }
    else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function roundRectPath(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function hexToRgba(hex, a) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return `rgba(235,10,30,${a})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/* ---------------- layer recording / nudging ---------------- */

let REC = null;
let SUPPRESS = null;
const NUDGE = {};
let CUR = null, CUR_ASSETS = {};

const NUDGE_KEYS = ["h1", "h2", "h3", "sub1", "sub2", "kicker", "giant",
  "offer", "offerLabel", "hashtag", "month", "bar", "tc",
  "badge1", "badge2", "badge3", "foot1", "foot2", "days", "tagline"];

function buildNudgeLookup(s) {
  const m = new Map();
  for (const k of NUDGE_KEYS) {
    const v = tok(s[k], s);
    if (v) { m.set(v, k); m.set(v.toUpperCase(), k); }
  }
  if (s.price) { m.set(s.price, "price"); m.set(s.price + "*", "price"); }
  return m;
}

function putImage(ctx, kind, img, x, y, w, h) {
  if (REC) REC.push({ type: "img", kind, img, x, y, w, h });
  if (SUPPRESS && SUPPRESS[kind]) return;
  ctx.drawImage(img, x, y, w, h);
}

function luminanceAt(ctx, x, y, w, h) {
  try {
    const cw = ctx.canvas.width, ch = ctx.canvas.height;
    x = Math.max(0, Math.min(cw - 2, x | 0));
    y = Math.max(0, Math.min(ch - 2, y | 0));
    w = Math.max(1, Math.min(cw - x, w | 0));
    h = Math.max(1, Math.min(ch - y, h | 0));
    const d = ctx.getImageData(x, y, w, h).data;
    let sum = 0, n = 0;
    for (let i = 0; i < d.length; i += 16) {
      sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; n++;
    }
    return n ? sum / (n * 255) : 0.35;
  } catch { return 0.35; }
}
function autoInk(ctx, x, y, w, h) {
  return luminanceAt(ctx, x, y, w, h) > 0.6 ? BRAND.black : BRAND.white;
}

const TINT_CACHE = new WeakMap();
function tinted(img, colour) {
  let m = TINT_CACHE.get(img);
  if (!m) { m = new Map(); TINT_CACHE.set(img, m); }
  let c = m.get(colour);
  if (!c) {
    c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const x = c.getContext("2d");
    x.drawImage(img, 0, 0);
    x.globalCompositeOperation = "source-in";
    x.fillStyle = colour;
    x.fillRect(0, 0, c.width, c.height);
    m.set(colour, c);
  }
  return c;
}

/* ---------------- backgrounds & overlay ---------------- */

function drawPlaceholderBg(ctx, W, H, hint) {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, "#3a3f46"); g.addColorStop(0.55, "#20242a"); g.addColorStop(1, "#101317");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  if (hint) {
    ctx.save();
    ctx.globalAlpha = 0.5; ctx.fillStyle = "#fff";
    ctx.font = F(Math.max(12, Math.min(W, H) * 0.035), 600);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("Upload a vehicle / background photo", W / 2, H / 2);
    ctx.restore();
  }
}

function drawBackground(ctx, W, H, assets, opts, fx = 0.5, fy = 0.5, x = 0, y = 0, w = null, h = null) {
  w = w == null ? W : w; h = h == null ? H : h;
  if (assets.bg) drawCover(ctx, assets.bg, x, y, w, h, fx, fy);
  else {
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.translate(x, y);
    drawPlaceholderBg(ctx, w, h, opts && opts.hint);
    ctx.restore();
  }
  if (CUR && CUR.scrimMode && CUR.scrimMode !== "none" && CUR.scrim > 0) {
    ctx.fillStyle = CUR.scrimMode === "light"
      ? `rgba(255,255,255,${CUR.scrim})` : `rgba(0,0,0,${CUR.scrim})`;
    ctx.fillRect(x, y, w, h);
  }
}

/* Up to three vehicle cutouts share the zone: single centred, pair at
   30/70, trio at 20/50/80 with the middle vehicle larger and in front.
   Each vehicle has its own size (vehScaleN) and can be dragged on the
   preview (NUDGE key "vehN"). */
function drawOverlayImg(ctx, x, y, w, h, fit) {
  const vehs = (CUR_ASSETS.vehicles || [])
    .map((img, i) => ({ img, i }))
    .filter((v) => v.img);
  if (!vehs.length) return null;
  const n = vehs.length;
  const slots = n === 1 ? [0.5] : n === 2 ? [0.3, 0.7] : [0.2, 0.5, 0.8];
  const order = n === 3 ? [0, 2, 1] : n === 2 ? [0, 1] : [0];
  let last = null;
  for (const oi of order) {
    const v = vehs[oi];
    const key = "veh" + (v.i + 1);
    const scale = (CUR && CUR["vehScale" + (v.i + 1)]) || 1;
    const baseH = n === 1
      ? h + (fit ? 0 : ctx.canvas.height * 0.005)
      : h * (n === 2 ? 0.85 : 0.72) * (n === 3 && oi === 1 ? 1.3 : 1);
    const r = Math.min((w / n) * (fit ? 1 : 1.4) / v.img.width, baseH / v.img.height) * scale;
    const dw = v.img.width * r, dh = v.img.height * r;
    let cx = x + w * slots[oi];
    let by = y + h;
    const nd = NUDGE[key];
    if (nd) { cx += nd.dx * ctx.canvas.width; by += nd.dy * ctx.canvas.height; }
    const dx = cx - dw / 2, dy = by - dh;
    if (REC) REC.push({ type: "img", kind: "vehicle", key, img: v.img, x: dx, y: dy, w: dw, h: dh });
    if (!(SUPPRESS && SUPPRESS.vehicle)) ctx.drawImage(v.img, dx, dy, dw, dh);
    last = { x: dx, y: dy, w: dw, h: dh };
  }
  return last;
}

/* ================= MASTERBRAND CHROME ================= */

/* Toyota logo sizing per layout shape (14.5) + margin (~40% logo h). */
function logoSpec(W, H) {
  const r = W / H;
  let h;
  if (r >= 1.7) h = H / 6;
  else if (r >= 1.2) h = H / 6.5;
  else if (r >= 0.8) h = Math.min(W, H) / 7;
  else h = W / 5.5;
  h *= (typeof RULES !== "undefined" ? RULES.logoScale : 1);
  h = Math.min(h, Math.min(W, H) * 0.2);
  const mScale = typeof RULES !== "undefined" ? RULES.marginScale : 1;
  return { h, w: h * 1.245, margin: h * 0.4 * mScale };
}

function alignAnchor(align, x0, x1) {
  if (align === "left") return { x: x0, ta: "left" };
  if (align === "centre") return { x: (x0 + x1) / 2, ta: "center" };
  return { x: x1, ta: "right" };
}
function oppositeAlign(a) {
  return a === "left" ? "right" : a === "right" ? "left" : a;
}

/* Toyota Product vertical logo (mandatory, paid comms). */
function logoVisible() {
  return typeof RULES === "undefined" || RULES.showToyotaLogo !== false;
}

function drawToyotaLogo(ctx, s, W, H, colour) {
  const spec = logoSpec(W, H);
  const img = logoVisible() ? CUR_ASSETS.toyotaLogo : null;
  const align = s.logoAlign || "right";
  const x = align === "left" ? spec.margin
    : align === "centre" ? (W - spec.w) / 2
    : W - spec.margin - spec.w;
  const y = spec.margin;
  if (img) putImage(ctx, "logo", tinted(img, colour), x, y, spec.w, spec.h);
  return { x, y, w: spec.w, h: spec.h, margin: spec.margin, align, spec };
}

/* Dealer tag header: dealership name as text at the top (15.7). */
function drawDealerHeader(ctx, s, W, H, logo, colour) {
  if (!s.dealer || s.branding !== "paid") return;
  if (typeof RULES !== "undefined" && !RULES.showDealerHeader) return;
  const px = logo.h * 0.17;
  ctx.save();
  ctx.font = F(px, 600);
  ctx.fillStyle = colour;
  ctx.textBaseline = "top";
  if (logo.align === "left") {
    ctx.textAlign = "right";
    ctx.fillText(s.dealer, W - logo.margin, logo.y + px * 0.2);
  } else {
    ctx.textAlign = "left";
    ctx.fillText(s.dealer, logo.margin, logo.y + px * 0.2);
  }
  ctx.restore();
}

/* Resolve which OWAF artwork suits the surface. */
function owafFor(ctx, s, x, y, w, h, surface) {
  if (CUR_ASSETS.owaf) return CUR_ASSETS.owaf;
  let variant = !s.owafVariant || s.owafVariant === "auto" ? null : s.owafVariant;
  if (variant === "off") return null;
  if (!variant) {
    if (surface === "light") variant = "red";
    else if (surface === "dark") variant = "white";
    else variant = luminanceAt(ctx, x, y, w, h) > 0.6 ? "red" : "white";
  }
  return (CUR_ASSETS.owafPack && CUR_ASSETS.owafPack[variant]) || null;
}

/* Base furniture: dealer sign-off, OWAF (175% logo width), then
   disclaimers underneath at the very base (14.8, 15.7).
   Returns the y where free layout space ends. */
function drawBaseFurniture(ctx, s, W, H, logo, opts) {
  opts = opts || {};
  if (s.branding === "organic") return H - logo.margin;
  const chrome = s.branding === "paid"; // social ads keep disclaimers only
  const inkCol = opts.ink || BRAND.white;
  // on wide formats the furniture takes the opposite side from the copy
  const fAlign = W / H > 1.4 ? oppositeAlign(logo.align) : logo.align;
  const anchor = alignAnchor(fAlign, logo.margin, W - logo.margin);
  let baseY = H - logo.margin * 0.6;

  // disclaimers at the very base
  if (s.disclaimer) {
    const dp = Math.max(8, logo.h * 0.085);
    ctx.font = F(dp, 400);
    ctx.fillStyle = inkCol;
    ctx.globalAlpha = 0.8;
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = anchor.ta;
    const lines = wrapText(ctx, s.disclaimer, W - logo.margin * 2);
    let dy = baseY;
    for (let i = lines.length - 1; i >= 0; i--) { ctx.fillText(lines[i], anchor.x, dy); dy -= dp * 1.3; }
    ctx.globalAlpha = 1;
    baseY = dy - dp * 0.6;
  }

  if (!chrome) return baseY - logo.h * 0.1;

  // OWAF tagline: width 175% of the Toyota logo width
  const owafSurface = opts.surface || null;
  let ow = Math.min(logo.w * ((typeof RULES !== "undefined" ? RULES.owafWidthPct : 175) / 100), W * 0.44);
  const probe = owafFor(ctx, s, anchor.ta === "right" ? anchor.x - ow : anchor.x, baseY - ow * 0.35, ow, ow * 0.35, owafSurface);
  if (probe) {
    const oh = ow * (probe.height / probe.width);
    const ox = anchor.ta === "left" ? anchor.x : anchor.ta === "center" ? anchor.x - ow / 2 : anchor.x - ow;
    const oy = baseY - oh;
    putImage(ctx, "owaf", probe, ox, oy, ow, oh);
    baseY = oy - logo.h * 0.18;
  }

  // dealer sign-off: name (semibold) + details (regular), read before OWAF
  if (s.dealer && (typeof RULES === "undefined" || RULES.showSignOff)) {
    const np = logo.h * 0.15;
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = anchor.ta;
    if (s.dealerDetails) {
      ctx.font = F(np * 0.78, 400);
      ctx.fillStyle = inkCol; ctx.globalAlpha = 0.9;
      ctx.fillText(s.dealerDetails, anchor.x, baseY);
      ctx.globalAlpha = 1;
      baseY -= np * 1.15;
    }
    ctx.font = F(np, 600);
    ctx.fillStyle = inkCol;
    ctx.fillText(s.dealer, anchor.x, baseY);
    baseY -= np * 1.5;
  }
  return baseY;
}

/* CTA in one of the three masterbrand styles (14.7/14.17). */
function drawCtaButton(ctx, text, cx, cy, px, bg, fg, minW = 0, key = "cta") {
  if (NUDGE[key]) {
    cx += NUDGE[key].dx * ctx.canvas.width;
    cy += NUDGE[key].dy * ctx.canvas.height;
  }
  ctx.font = F(px, 600);
  const tw = ctx.measureText(text).width;
  const w = Math.max(minW, tw + px * 2.2);
  const h = px * 2.1;
  const rect = { x: cx - w / 2, y: cy - h / 2, w, h };
  if (REC) REC.push({ type: "cta", key, text, x: rect.x, y: rect.y, w, h, px, bg, fg });
  if (SUPPRESS && SUPPRESS.cta) return rect;
  roundRectPath(ctx, rect.x, rect.y, w, h, h / 2);
  ctx.fillStyle = bg; ctx.fill();
  ctx.fillStyle = fg;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  (ctx.__origFillText || ctx.fillText.bind(ctx))(text, cx, cy + px * 0.05);
  return rect;
}

function drawCta(ctx, s, text, x, y, px, align, surface) {
  if (!text || s.branding === "organic") return y;
  const style = s.ctaStyle || "pill";
  const onRed = surface === "red";
  if (style === "pill") {
    const bg = onRed ? BRAND.white : BRAND.red;
    const fg = onRed ? BRAND.red : BRAND.white;
    ctx.font = F(px, 600);
    const w = ctx.measureText(text.toUpperCase()).width + px * 2.2;
    const cx = align === "left" ? x + w / 2 : align === "center" ? x : x - w / 2;
    drawCtaButton(ctx, text.toUpperCase(), cx, y, px, bg, fg);
    return y - px * 2.4;
  }
  ctx.textBaseline = "middle"; ctx.textAlign = align;
  if (style === "upper") {
    ctx.font = F(px * 1.05, 700);
    ctx.fillStyle = surface === "light" ? BRAND.red : BRAND.white;
    ctx.fillText(text.toUpperCase(), x, y);
  } else { // sentence case + arrow
    ctx.font = F(px * 1.05, 600);
    ctx.fillStyle = surface === "light" ? BRAND.red : BRAND.white;
    ctx.fillText(text + "  ›", x, y);
  }
  return y - px * 2;
}

/* Red text-holder roundel (14.11); black on red backgrounds (14.4). */
function drawRoundel(ctx, s, cx, cy, r, lines, surface) {
  const bg = surface === "red" ? BRAND.black : BRAND.red;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = bg; ctx.fill();
  ctx.fillStyle = BRAND.white;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const rows = lines.filter(Boolean);
  const step = (r * 1.1) / Math.max(1, rows.length - 1 || 1);
  let yy = cy - ((rows.length - 1) * step) / 2;
  rows.forEach((ln, i) => {
    const big = rows.length === 3 ? i === 1 : i === 0;
    const p = fitText(ctx, ln, r * 1.55, big ? r * 0.36 : r * 0.2, big ? 800 : 600);
    ctx.font = F(p, big ? 800 : 600);
    ctx.fillText(ln, cx, yy);
    yy += step;
  });
}

/* ================= TEMPLATES ================= */

/* 1. Full-bleed image (14.3): image + headline integrated, minimal
   typography; white type unless illegible. */
function drawFullBleed(ctx, W, H, s, assets, opts) {
  drawBackground(ctx, W, H, assets, opts);
  drawOverlayImg(ctx, 0, H * 0.3, W, H * 0.45);

  const logoRect = logoSpec(W, H);
  const inkTop = s.branding !== "paid" ? autoInk(ctx, 0, 0, W, H * 0.3)
    : autoInk(ctx, 0, 0, W, logoRect.h + logoRect.margin * 2);
  let logo = { x: 0, y: logoRect.margin, w: logoRect.w, h: logoRect.h, margin: logoRect.margin, align: s.logoAlign || "right" };
  if (s.branding === "paid") {
    logo = drawToyotaLogo(ctx, s, W, H, inkTop);
    drawDealerHeader(ctx, s, W, H, logo, inkTop);
  }
  const anchor = alignAnchor(logo.align, logo.margin, W - logo.margin);
  const maxW = W - logo.margin * 2;

  // headline block sits under the logo band
  let y = logo.y + logo.h + logo.margin * 1.6;
  const h1 = tok(s.h1, s), sub1 = tok(s.sub1, s);
  const ink = autoInk(ctx, logo.margin, y, maxW, H * 0.22);
  ctx.textAlign = anchor.ta; ctx.textBaseline = "alphabetic";
  let p1 = Math.min(W, H) * 0.085;
  ctx.font = F(p1, 800);
  let lines = wrapText(ctx, h1, maxW);
  if (lines.length > 3) { p1 *= 0.82; ctx.font = F(p1, 800); lines = wrapText(ctx, h1, maxW); }
  ctx.fillStyle = ink;
  for (const ln of lines) { y += p1 * 1.05; ctx.fillText(ln, anchor.x, y); }
  if (sub1) {
    const ps = fitText(ctx, sub1, maxW, p1 * 0.34, 600);
    ctx.font = F(ps, 600); ctx.fillStyle = ink;
    y += ps * 1.9; ctx.fillText(sub1, anchor.x, y);
  }
  if (s.price) {
    const pt = `From ${s.price}* driveaway`;
    const pp = fitText(ctx, pt, maxW * 0.8, p1 * 0.3, 700);
    ctx.font = F(pp, 700); ctx.fillStyle = ink;
    y += pp * 2; ctx.fillText(pt, anchor.x, y);
  }
  // CTA follows the copy block (14.6: CTA follows headline alignment)
  drawCta(ctx, s, tok(s.cta, s), anchor.x, y + Math.min(W, H) * 0.06,
    Math.min(W, H) * 0.026, anchor.ta === "center" ? "center" : anchor.ta, null);

  drawBaseFurniture(ctx, s, W, H, logo, { ink: autoInk(ctx, 0, H * 0.78, W, H * 0.22) });
}

/* 2. Strip layout (14.2/14.4): image + solid strip on one edge,
   30–60% of the layout; logo, type, tagline in the strip. */
function drawStrip(ctx, W, H, s, assets, opts) {
  const edge = s.stripEdge || "bottom";
  const colour = s.stripColour || "white";
  const stripFill = colour === "red" ? BRAND.red : colour === "black" ? BRAND.black : BRAND.white;
  const surface = colour === "white" ? "light" : colour === "red" ? "red" : "dark";
  const ink = colour === "white" ? BRAND.black : BRAND.white;
  const accent = colour === "white" ? BRAND.red : BRAND.white;

  const vertical = edge === "left" || edge === "right";
  const frac = vertical ? 0.44 : 0.42;
  let sx = 0, sy = 0, sw = W, sh = H, ix = 0, iy = 0, iw = W, ih = H;
  if (edge === "bottom") { sh = H * frac; sy = H - sh; ih = H - sh; }
  if (edge === "top") { sh = H * frac; ih = H - sh; iy = sh; }
  if (edge === "left") { sw = W * frac; iw = W - sw; ix = sw; }
  if (edge === "right") { sw = W * frac; sx = W - sw; iw = W - sw; }

  ctx.fillStyle = stripFill; ctx.fillRect(0, 0, W, H);
  drawBackground(ctx, W, H, assets, opts, 0.5, 0.45, ix, iy, iw, ih);
  drawOverlayImg(ctx, ix, iy + ih * 0.2, iw, ih * 0.82);
  ctx.fillStyle = stripFill; ctx.fillRect(sx, sy, sw, sh); // repaint strip over any overlay overhang

  // chrome lives inside the strip (logo clamped to the strip zone)
  const spec = logoSpec(W, H);
  spec.h = Math.min(spec.h, sh * 0.26);
  spec.w = spec.h * 1.245;
  spec.margin = spec.h * 0.45;
  const m = spec.margin;
  const align = s.logoAlign || "right";
  const lx = align === "left" ? sx + m : align === "centre" ? sx + (sw - spec.w) / 2 : sx + sw - m - spec.w;
  const logo = { x: lx, y: sy + m, w: spec.w, h: spec.h, margin: m, align };
  if (s.branding === "paid" && CUR_ASSETS.toyotaLogo) {
    if (logoVisible()) putImage(ctx, "logo", tinted(CUR_ASSETS.toyotaLogo, ink), logo.x, logo.y, logo.w, logo.h);
    if (s.dealer && (typeof RULES === "undefined" || RULES.showDealerHeader)) {
      const px = logo.h * 0.17;
      ctx.font = F(px, 600); ctx.fillStyle = ink; ctx.textBaseline = "top";
      ctx.textAlign = align === "left" ? "right" : "left";
      ctx.fillText(s.dealer, align === "left" ? sx + sw - m : sx + m, logo.y + px * 0.2);
    }
  }
  const anchor = alignAnchor(align, sx + m, sx + sw - m);
  const maxW = sw - m * 2;

  // furniture first, on the opposite side from the copy, so the strip
  // reads copy on one side / sign-off + OWAF on the other (as 15.7)
  const zone = { margin: m, align: oppositeAlign(align), w: logo.w, h: logo.h, y: logo.y };
  const bottomEdge = edge === "top" ? sh : H;
  const fTop = drawBaseFurnitureIn(ctx, s, sx + m, sx + sw - m, bottomEdge, zone, surface, ink);
  // copy on its own side can flow deeper than the opposite-side furniture
  const furnitureTop = align !== zone.align ? bottomEdge - m * 1.4 : fTop;

  let y = logo.y + logo.h + m * 0.9;
  const avail = Math.max(sh * 0.22, furnitureTop - y);
  const h1 = tok(s.h1, s), sub1 = tok(s.sub1, s), offer = tok(s.offer, s);
  ctx.textAlign = anchor.ta; ctx.textBaseline = "alphabetic";
  let p1 = Math.min(Math.min(sw, sh) * (vertical ? 0.1 : 0.13), avail * 0.3);
  ctx.font = F(p1, 800);
  let lines = wrapText(ctx, h1, maxW);
  if (lines.length > 3) { p1 *= 0.8; ctx.font = F(p1, 800); lines = wrapText(ctx, h1, maxW); }
  ctx.fillStyle = ink;
  for (const ln of lines) { y += p1 * 1.05; ctx.fillText(ln, anchor.x, y); }
  if (sub1 && y + p1 * 0.8 < furnitureTop) {
    const ps = fitText(ctx, sub1, maxW, p1 * 0.36, 600);
    ctx.font = F(ps, 600); ctx.fillStyle = ink;
    y += ps * 1.9; ctx.fillText(sub1, anchor.x, y);
  }
  if (offer && y + p1 * 0.9 < furnitureTop) {
    const po = fitText(ctx, offer, maxW, p1 * 0.42, 800);
    ctx.font = F(po, 800); ctx.fillStyle = accent;
    y += po * 1.8; ctx.fillText(offer, anchor.x, y);
  }
  const ctaPx = Math.min(W, H) * 0.024;
  if (y + ctaPx * 4 < furnitureTop) {
    drawCta(ctx, s, tok(s.cta, s), anchor.x, y + ctaPx * 2.4,
      ctaPx, anchor.ta === "center" ? "center" : anchor.ta, surface);
  }
}

/* Furniture helper bounded to a horizontal zone (used by strip/offer). */
function drawBaseFurnitureIn(ctx, s, x0, x1, bottom, logo, surface, ink) {
  if (s.branding === "organic") return bottom - logo.margin;
  const chrome = s.branding === "paid";
  const anchor = alignAnchor(logo.align, x0, x1);
  let baseY = bottom - logo.margin * 0.6;
  if (s.disclaimer) {
    const dp = Math.max(8, logo.h * 0.085);
    ctx.font = F(dp, 400); ctx.fillStyle = ink; ctx.globalAlpha = 0.75;
    ctx.textAlign = anchor.ta; ctx.textBaseline = "alphabetic";
    const lines = wrapText(ctx, s.disclaimer, x1 - x0);
    let dy = baseY;
    for (let i = lines.length - 1; i >= 0; i--) { ctx.fillText(lines[i], anchor.x, dy); dy -= dp * 1.3; }
    ctx.globalAlpha = 1;
    baseY = dy - dp * 0.5;
  }
  if (!chrome) return baseY - logo.h * 0.1;
  let ow = Math.min(logo.w * ((typeof RULES !== "undefined" ? RULES.owafWidthPct : 175) / 100), (x1 - x0) * 0.6);
  const probe = owafFor(ctx, s, 0, 0, 0, 0, surface);
  if (probe) {
    const oh = ow * (probe.height / probe.width);
    const ox = anchor.ta === "left" ? anchor.x : anchor.ta === "center" ? anchor.x - ow / 2 : anchor.x - ow;
    putImage(ctx, "owaf", probe, ox, baseY - oh, ow, oh);
    baseY -= oh + logo.h * 0.18;
  }
  if (s.dealer && (typeof RULES === "undefined" || RULES.showSignOff)) {
    const np = logo.h * 0.15;
    ctx.textAlign = anchor.ta; ctx.textBaseline = "alphabetic";
    if (s.dealerDetails) {
      ctx.font = F(np * 0.78, 400); ctx.fillStyle = ink; ctx.globalAlpha = 0.85;
      ctx.fillText(s.dealerDetails, anchor.x, baseY);
      ctx.globalAlpha = 1;
      baseY -= np * 1.15;
    }
    ctx.font = F(np, 600); ctx.fillStyle = ink;
    ctx.fillText(s.dealer, anchor.x, baseY);
    baseY -= np * 1.5;
  }
  return baseY;
}

/* 3. Colour background (14.3): solid white/black/red, product focus,
   text-holder roundel for the offer. */
function drawColourBg(ctx, W, H, s, assets, opts) {
  const bg = s.bgColour || "white";
  const fill = bg === "red" ? BRAND.red : bg === "black" ? BRAND.black : BRAND.white;
  const surface = bg === "white" ? "light" : bg === "red" ? "red" : "dark";
  const ink = bg === "white" ? BRAND.black : BRAND.white;
  const accent = bg === "white" ? BRAND.red : BRAND.white;
  ctx.fillStyle = fill; ctx.fillRect(0, 0, W, H);

  const logo = s.branding === "paid"
    ? drawToyotaLogo(ctx, s, W, H, ink)
    : Object.assign(logoSpec(W, H), { x: 0, y: 0, align: s.logoAlign || "right" });
  if (s.branding === "paid") drawDealerHeader(ctx, s, W, H, logo, ink);
  const anchor = alignAnchor(logo.align, logo.margin, W - logo.margin);
  const maxW = W - logo.margin * 2;

  let y = logo.y + logo.h + logo.margin * 1.4;
  const h1 = tok(s.h1, s), sub1 = tok(s.sub1, s);
  ctx.textAlign = anchor.ta; ctx.textBaseline = "alphabetic";
  let p1 = Math.min(W, H) * 0.09;
  ctx.font = F(p1, 800);
  let lines = wrapText(ctx, h1, maxW);
  if (lines.length > 2) { p1 *= 0.85; ctx.font = F(p1, 800); lines = wrapText(ctx, h1, maxW); }
  ctx.fillStyle = ink;
  for (const ln of lines) { y += p1 * 1.05; ctx.fillText(ln, anchor.x, y); }
  if (sub1) {
    const ps = fitText(ctx, sub1, maxW, p1 * 0.33, 600);
    ctx.font = F(ps, 600); ctx.fillStyle = ink; ctx.globalAlpha = 0.85;
    y += ps * 1.9; ctx.fillText(sub1, anchor.x, y);
    ctx.globalAlpha = 1;
  }

  // CTA follows the copy block
  const ctaPx = Math.min(W, H) * 0.025;
  drawCta(ctx, s, tok(s.cta, s), anchor.x, y + ctaPx * 2.6,
    ctaPx, anchor.ta === "center" ? "center" : anchor.ta, surface);
  y += ctaPx * 4.2;

  // product zone: studio cutout, roundel text holder beside it
  const furnitureTop = drawBaseFurniture(ctx, s, W, H, logo, { ink, surface });
  const zoneTop = y + logo.margin * 0.4;
  const zoneBot = Math.max(zoneTop + H * 0.16, furnitureTop - logo.h * 0.2);
  drawOverlayImg(ctx, W * 0.06, zoneTop, W * 0.88, zoneBot - zoneTop);
  const b1 = tok(s.badge1, s), b2 = tok(s.badge2, s), b3 = tok(s.badge3, s);
  if (b1 || b2 || b3) {
    const r = Math.min(W, H) * 0.125;
    const wide = W / H > 1.4;
    const cx = wide ? (logo.align === "left" ? W * 0.64 : W * 0.36)
      : logo.align === "left" ? W - logo.margin - r : logo.margin + r;
    const cy = wide ? H * 0.42 : Math.min(zoneTop + r * 0.9, H * 0.62);
    drawRoundel(ctx, s, cx, cy, r, [b1, b2, b3], surface);
  }
}

/* 4. Retail offer: white layout, price lockup, red base strip that
   carries the sign-off and OWAF (after 14.8 / 15.7 examples). */
function drawOffer(ctx, W, H, s, assets, opts) {
  ctx.fillStyle = BRAND.white; ctx.fillRect(0, 0, W, H);
  const logo = s.branding === "paid"
    ? drawToyotaLogo(ctx, s, W, H, BRAND.black)
    : Object.assign(logoSpec(W, H), { x: 0, y: 0, align: s.logoAlign || "right" });
  if (s.branding === "paid") drawDealerHeader(ctx, s, W, H, logo, BRAND.black);
  const anchor = alignAnchor(logo.align, logo.margin, W - logo.margin);
  const maxW = W - logo.margin * 2;

  const stripH = s.branding !== "paid" ? 0 : Math.max(H * 0.085, logo.h * 0.62);
  const stripY = H - stripH;

  let y = logo.y + logo.h + logo.margin * 1.3;
  const h1 = tok(s.h1, s), sub1 = tok(s.sub1, s), tc = tok(s.tc, s);
  ctx.textAlign = anchor.ta; ctx.textBaseline = "alphabetic";
  let p1 = Math.min(W, H) * 0.095;
  ctx.font = F(p1, 800);
  let lines = wrapText(ctx, h1, maxW);
  if (lines.length > 2) { p1 *= 0.85; ctx.font = F(p1, 800); lines = wrapText(ctx, h1, maxW); }
  ctx.fillStyle = BRAND.black;
  for (const ln of lines) { y += p1 * 1.05; ctx.fillText(ln, anchor.x, y); }
  if (sub1) {
    const ps = fitText(ctx, sub1, maxW, p1 * 0.32, 600);
    ctx.font = F(ps, 600); ctx.fillStyle = BRAND.slate;
    y += ps * 1.9; ctx.fillText(sub1, anchor.x, y);
  }

  // price lockup: From | $XX,XXX | driveaway*
  if (s.price) {
    y += logo.margin * 1.1;
    const fp = Math.min(W, H) * 0.03;
    ctx.font = F(fp, 600); ctx.fillStyle = BRAND.black;
    ctx.fillText("From", anchor.x, y);
    const pp = fitText(ctx, s.price, maxW * 0.66, Math.min(W, H) * 0.105, 800);
    ctx.font = F(pp, 800); ctx.fillStyle = BRAND.red;
    y += pp * 0.95; ctx.fillText(s.price, anchor.x, y);
    ctx.font = F(pp * 0.24, 600); ctx.fillStyle = BRAND.black;
    y += pp * 0.42; ctx.fillText("driveaway*", anchor.x, y);
  }
  if (tc) {
    const tp = Math.min(W, H) * 0.017;
    ctx.font = F(tp, 400); ctx.fillStyle = BRAND.grey;
    y += tp * 2.6;
    ctx.fillText(wrapText(ctx, tc, maxW)[0] || "", anchor.x, y);
  }

  // CTA follows the copy block
  const ctaPx = Math.min(W, H) * 0.025;
  drawCta(ctx, s, tok(s.cta, s), anchor.x, y + ctaPx * 2.6,
    ctaPx, anchor.ta === "center" ? "center" : anchor.ta, "light");
  y += ctaPx * 4;

  // vehicle cutout: beside the copy on wide formats, below it otherwise
  if (W / H > 1.4) {
    const side = logo.align === "left"
      ? { x: W * 0.52, w: W * 0.44 } : { x: logo.margin, w: W * 0.46 };
    drawOverlayImg(ctx, side.x, H * 0.18, side.w, stripY - H * 0.22);
  } else {
    drawOverlayImg(ctx, W * 0.05, y, W * 0.9, Math.max(H * 0.14, stripY - y - logo.margin * 0.3));
  }

  if (stripH > 0) {
    ctx.fillStyle = BRAND.red; ctx.fillRect(0, stripY, W, stripH);
    // sign-off left, OWAF right inside the strip (or mirrored)
    const m = logo.margin;
    const np = Math.min(stripH * 0.26, logo.h * 0.16);
    ctx.textBaseline = "middle";
    const left = logo.align !== "left";
    if (s.dealer && (typeof RULES === "undefined" || RULES.showSignOff)) {
      ctx.textAlign = left ? "left" : "right";
      ctx.font = F(np, 600); ctx.fillStyle = BRAND.white;
      const dx = left ? m : W - m;
      if (s.dealerDetails) {
        ctx.fillText(s.dealer, dx, stripY + stripH * 0.36);
        ctx.font = F(np * 0.78, 400);
        ctx.fillText(s.dealerDetails, dx, stripY + stripH * 0.68);
      } else ctx.fillText(s.dealer, dx, stripY + stripH / 2);
    }
    const probe = owafFor(ctx, s, 0, 0, 0, 0, "red");
    if (probe && probe !== CUR_ASSETS.owafPack?.red || probe) {
      const img = (CUR_ASSETS.owafPack && CUR_ASSETS.owafPack.white) || probe;
      const wide = img.width / img.height > 5;
      const oh = stripH * (wide ? 0.3 : 0.62);
      const ow2 = oh * (img.width / img.height);
      const ox = left ? W - m - ow2 : m;
      putImage(ctx, "owaf", img, ox, stripY + (stripH - oh) / 2, ow2, oh);
    }
  }
}

/* 5. Launch spotlight: black colour-background family with circle
   graphic energy (14.11/15.5); name in giant type behind the cutout. */
function drawSpotlight(ctx, W, H, s, assets, opts) {
  ctx.fillStyle = BRAND.black; ctx.fillRect(0, 0, W, H);
  if (assets.bg) {
    drawCover(ctx, assets.bg, 0, 0, W, H, 0.5, 0.5);
    ctx.fillStyle = "rgba(0,0,0,0.82)"; ctx.fillRect(0, 0, W, H);
  }
  const U = Math.min(W, H);
  let g = ctx.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H * 0.45, U * 0.7);
  g.addColorStop(0, hexToRgba(BRAND.red, 0.28));
  g.addColorStop(0.6, hexToRgba(BRAND.red, 0.07));
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // circle-language particles
  ctx.save();
  ctx.globalAlpha = 0.5;
  let seed = 9;
  for (let i = 0; i < 42; i++) {
    seed = (seed * 16807) % 2147483647;
    const rx = (seed % 1000) / 1000; seed = (seed * 16807) % 2147483647;
    const ry = (seed % 1000) / 1000; seed = (seed * 16807) % 2147483647;
    const rr = ((seed % 1000) / 1000) * U * 0.006 + U * 0.0015;
    const px = W / 2 + (rx - 0.5) * W * 0.9;
    const py = H * 0.42 + (ry - 0.5) * H * 0.55;
    const d = Math.hypot(px - W / 2, py - H * 0.45) / (U * 0.6);
    ctx.globalAlpha = Math.max(0, 0.5 - d * 0.4);
    ctx.beginPath(); ctx.arc(px, py, rr, 0, Math.PI * 2);
    ctx.fillStyle = "#fff"; ctx.fill();
  }
  ctx.restore();

  const logo = s.branding === "paid"
    ? drawToyotaLogo(ctx, s, W, H, BRAND.white)
    : Object.assign(logoSpec(W, H), { x: 0, y: 0, align: s.logoAlign || "right" });
  if (s.branding === "paid") drawDealerHeader(ctx, s, W, H, logo, BRAND.white);

  const kicker = tok(s.kicker, s), giant = (tok(s.giant, s) || "").toUpperCase();
  const sub1 = tok(s.sub1, s);
  ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
  if (kicker) {
    const pk = fitText(ctx, kicker, W * 0.7, U * 0.03, 600);
    ctx.font = F(pk, 600); ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText(kicker.toUpperCase(), W / 2, logo.y + logo.h + logo.margin * 1.6);
  }
  if (giant) {
    const pg = fitText(ctx, giant, W * 0.92, H * 0.2, 800);
    ctx.font = F(pg, 800); ctx.fillStyle = BRAND.white;
    ctx.fillText(giant, W / 2, H * 0.5);
  }
  const ovRegion = { x: W * 0.07, y: H * 0.3, w: W * 0.86, h: H * 0.42 };
  if ((CUR_ASSETS.vehicles || []).some(Boolean)) {
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.beginPath();
    ctx.ellipse(W / 2, ovRegion.y + ovRegion.h, W * 0.3 * (s.ovScale || 0.9), U * 0.028, 0, 0, Math.PI * 2);
    ctx.filter = `blur(${Math.max(2, U * 0.012)}px)`;
    ctx.fill();
    ctx.restore();
  }
  drawOverlayImg(ctx, ovRegion.x, ovRegion.y, ovRegion.w, ovRegion.h);
  if (sub1) {
    const ps = fitText(ctx, sub1, W * 0.84, U * 0.028, 600);
    ctx.font = F(ps, 600); ctx.fillStyle = BRAND.white;
    ctx.textAlign = "center";
    ctx.fillText(sub1.toUpperCase(), W / 2, H * 0.79);
  }
  const furnitureTop = drawBaseFurniture(ctx, s, W, H, logo, { ink: BRAND.white, surface: "dark" });
  drawCta(ctx, s, tok(s.cta, s), W / 2, Math.min(H * 0.87, furnitureTop - logo.h * 0.35),
    U * 0.025, "center", "dark");
}

/* 6. Sale event: white layout, red text-holder date card and roundel. */
function drawEvent(ctx, W, H, s, assets, opts) {
  ctx.fillStyle = BRAND.white; ctx.fillRect(0, 0, W, H);
  const portrait = H / W > 1.3, landscape = W / H > 1.4;
  const U = Math.min(W, H);
  const photoW = landscape ? W * 0.5 : W;
  const photoH = landscape ? H : H * (portrait ? 0.34 : 0.38);
  drawBackground(ctx, W, H, assets, opts, 0.5, 0.5, 0, 0, photoW, photoH);
  drawOverlayImg(ctx, 0, 0, photoW, landscape ? H * 0.8 : photoH + H * 0.03);

  // date card (rounded text holder, red header)
  const month = tok(s.month, s);
  const dates = tok(s.dates, s).split(",").map((t) => t.trim()).filter(Boolean);
  if (month || dates.length) {
    const cw = Math.min(photoW * 0.8, U * 0.8);
    const cx0 = (photoW - cw) / 2, cy0 = landscape ? H * 0.16 : H * 0.11;
    const hh = U * 0.05, bodyH = U * 0.115, rad = U * 0.012;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.25)"; ctx.shadowBlur = U * 0.02;
    roundRectPath(ctx, cx0, cy0, cw, hh + bodyH, rad);
    ctx.fillStyle = BRAND.white; ctx.fill();
    ctx.restore();
    ctx.save();
    roundRectPath(ctx, cx0, cy0, cw, hh + bodyH, rad); ctx.clip();
    ctx.fillStyle = BRAND.red; ctx.fillRect(cx0, cy0, cw, hh);
    ctx.restore();
    ctx.fillStyle = BRAND.white; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = F(hh * 0.52, 700);
    ctx.fillText(month.toUpperCase(), cx0 + cw / 2, cy0 + hh / 2 + hh * 0.03);
    const colW = cw / Math.max(1, dates.length);
    dates.forEach((d, i) => {
      const parts = d.split(/\s+/);
      const num = parts[0] || "", label = parts.slice(1).join(" ");
      const cxCol = cx0 + colW * i + colW / 2;
      const numPx = fitText(ctx, num, colW * 0.66, bodyH * 0.48, 800);
      ctx.font = F(numPx, 800); ctx.fillStyle = BRAND.black;
      ctx.fillText(num, cxCol, cy0 + hh + bodyH * 0.4);
      if (label) {
        ctx.font = F(bodyH * 0.15, 600); ctx.fillStyle = BRAND.grey;
        ctx.fillText(label.toUpperCase(), cxCol, cy0 + hh + bodyH * 0.76);
      }
      if (i > 0) {
        ctx.strokeStyle = BRAND.lightGrey; ctx.lineWidth = Math.max(1, U * 0.002);
        ctx.beginPath();
        ctx.moveTo(cx0 + colW * i, cy0 + hh + bodyH * 0.15);
        ctx.lineTo(cx0 + colW * i, cy0 + hh + bodyH * 0.85);
        ctx.stroke();
      }
    });
  }

  const logo = s.branding === "paid"
    ? drawToyotaLogo(ctx, s, W, H, autoInk(ctx, 0, 0, W, logoSpec(W, H).h * 2))
    : Object.assign(logoSpec(W, H), { x: 0, y: 0, align: s.logoAlign || "right" });

  const pad = landscape ? photoW + logo.margin : logo.margin;
  const maxW = (landscape ? W - photoW : W) - logo.margin * 2;
  let y = landscape ? H * 0.2 : photoH + logo.margin * 1.3;
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  const h1 = tok(s.h1, s), h2 = tok(s.h2, s);
  const p1 = fitText(ctx, h1, maxW * 0.85, U * 0.06, 800);
  ctx.font = F(p1, 800); ctx.fillStyle = BRAND.black;
  y += p1; ctx.fillText(h1, pad, y);
  const p2 = fitText(ctx, h2, maxW * 0.85, U * 0.08, 800);
  ctx.font = F(p2, 800); ctx.fillStyle = BRAND.red;
  y += p2 * 1.12; ctx.fillText(h2, pad, y);

  const offer = tok(s.offer, s), offerLabel = tok(s.offerLabel, s);
  if (offer) {
    const po = fitText(ctx, offer, maxW * 0.6, U * 0.09, 800);
    ctx.font = F(po, 800); ctx.fillStyle = BRAND.black;
    y += po * 1.3; ctx.fillText(offer, pad, y);
    if (offerLabel) {
      const pl = fitText(ctx, offerLabel, maxW * 0.55, U * 0.032, 600);
      ctx.font = F(pl, 600);
      y += pl * 1.7; ctx.fillText(offerLabel, pad, y);
    }
  }
  const b1 = tok(s.badge1, s), b2 = tok(s.badge2, s);
  if (b1 || b2) {
    const r = U * 0.1;
    drawRoundel(ctx, s, (landscape ? photoW : 0) + maxW + logo.margin - r * 0.6,
      landscape ? H * 0.55 : photoH + (H - photoH) * 0.34, r, [b1, b2], "light");
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  }
  const hashtag = tok(s.hashtag, s);
  if (hashtag) {
    const ph = fitText(ctx, hashtag, maxW * 0.6, U * 0.028, 700);
    ctx.font = F(ph, 700); ctx.fillStyle = BRAND.black;
    y += ph * 2.3; ctx.fillText(hashtag, pad, y);
  }

  const zone = { margin: logo.margin, align: "left", w: logo.w, h: logo.h, y: 0 };
  const furnitureTop = drawBaseFurnitureIn(ctx, s,
    landscape ? photoW + logo.margin : logo.margin, W - logo.margin, H,
    Object.assign(zone, { align: landscape ? "left" : (s.logoAlign === "left" ? "right" : "left") }),
    "light", BRAND.black);
  drawCta(ctx, s, tok(s.cta, s), landscape ? photoW + logo.margin : logo.margin,
    furnitureTop - logo.h * 0.3, U * 0.024, "left", "light");
}

/* Micro banners (14.15-14.17): fixed logo px, OWAF mandatory except
   restricted heights, CTA per size. Strip-style white layout. */
function drawMicro(ctx, W, H, s, assets, opts) {
  ctx.fillStyle = BRAND.white; ctx.fillRect(0, 0, W, H);
  const leaderboard = W / H > 3;
  const logoImg = CUR_ASSETS.toyotaLogo;
  const h1 = (tok(s.h1, s) || tok(s.giant, s) || "NEW STOCK HAS LANDED").toUpperCase();
  const cta = tok(s.cta, s) || "Find out more";

  if (!leaderboard) {
    // MREC 300x250: logo 42px, margin 12px
    const logoH = H * 0.168, margin = H * 0.048;
    const photoH = H * 0.42;
    drawBackground(ctx, W, H, assets, opts && { hint: false }, 0.5, 0.45, 0, 0, W, photoH);
    if (s.branding === "paid" && logoImg && logoVisible()) {
      const lw = logoH * 1.245;
      putImage(ctx, "logo", tinted(logoImg, autoInk(ctx, W - margin - lw, margin, lw, logoH)),
        W - margin - lw, margin, lw, logoH);
    }
    let y = photoH + margin;
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    if (s.branding === "paid" && s.dealer) {
      const dp = H * 0.045;
      ctx.font = F(dp, 600); ctx.fillStyle = BRAND.black;
      y += dp; ctx.fillText(s.dealer, margin, y);
    }
    let hp = H * 0.085;
    ctx.font = F(hp, 800);
    let lines = wrapText(ctx, h1, W - margin * 2).slice(0, 2);
    ctx.fillStyle = BRAND.black;
    for (const ln of lines) { y += hp * 1.08; ctx.fillText(ln, margin, y); }
    if (s.price) {
      const pp = fitText(ctx, s.price + "* driveaway", W * 0.7, H * 0.06, 700);
      ctx.font = F(pp, 700); ctx.fillStyle = BRAND.red;
      y += pp * 1.5; ctx.fillText(s.price + "* driveaway", margin, y);
    }
    drawCtaButton(ctx, cta.toUpperCase(), margin + W * 0.24, H - margin - H * 0.055,
      H * 0.045, BRAND.red, BRAND.white, W * 0.42);
    const owaf = s.branding === "paid" && CUR_ASSETS.owafPack && CUR_ASSETS.owafPack.red;
    if (owaf) {
      const ow = W * 0.3, oh = ow * (owaf.height / owaf.width);
      putImage(ctx, "owaf", owaf, W - margin - ow, H - margin - oh - (oh > H * 0.09 ? 0 : H * 0.02), ow, oh);
    }
  } else {
    // Leaderboard 728x90: logo 36px, margin 10px
    const margin = H * 0.11, logoH = H * 0.4;
    const photoW = W * 0.18;
    drawBackground(ctx, W, H, assets, opts && { hint: false }, 0.5, 0.5, 0, 0, photoW, H);
    let x = photoW + margin;
    ctx.textBaseline = "middle"; ctx.textAlign = "left";
    if (s.branding === "paid" && s.dealer) {
      const dp = H * 0.16;
      ctx.font = F(dp, 600); ctx.fillStyle = BRAND.black;
      ctx.fillText(s.dealer, x, H * 0.24);
    }
    const hp = fitText(ctx, h1, W * 0.3, H * 0.24, 800);
    ctx.font = F(hp, 800); ctx.fillStyle = BRAND.black;
    ctx.fillText(h1, x, s.dealer ? H * 0.66 : H * 0.5);
    let rx = W - margin;
    if (s.branding === "paid" && logoImg && logoVisible()) {
      const lw = logoH * 1.245;
      putImage(ctx, "logo", tinted(logoImg, BRAND.black), W - margin - lw, (H - logoH) / 2, lw, logoH);
      rx = W - margin - lw - margin;
    }
    const owaf = s.branding === "paid" && CUR_ASSETS.owafPack && CUR_ASSETS.owafPack.red;
    if (owaf) {
      const oh = H * 0.2, ow = oh * (owaf.width / owaf.height);
      putImage(ctx, "owaf", owaf, rx - ow, (H - oh) / 2, ow, oh);
      rx -= ow + margin;
    }
    const bp = H * 0.16;
    ctx.font = F(bp, 600);
    const bw = ctx.measureText(cta.toUpperCase()).width + bp * 2.2;
    drawCtaButton(ctx, cta.toUpperCase(), rx - bw / 2, H / 2, bp, BRAND.red, BRAND.white);
    rx -= bw + margin;
    if (s.price) {
      const pp = fitText(ctx, s.price + "*", W * 0.1, H * 0.26, 800);
      ctx.font = F(pp, 800); ctx.fillStyle = BRAND.red; ctx.textAlign = "right";
      ctx.fillText(s.price + "*", rx, H * 0.5);
    }
  }
}


/* Range hero — full-bleed centred stack: kicker, giant line 1 (white),
   giant line 2 (red), vehicles across the horizon, sentence sub-line,
   red pill and dealer line beneath. Built-in dusk backdrop when no
   photo is loaded. */
function drawRangeHero(ctx, W, H, s, assets, opts) {
  const U = Math.min(W, H);
  if (assets.bg) {
    drawBackground(ctx, W, H, assets, opts, 0.5, 0.55);
  } else {
    // dusk stage: deep teal sky, warm horizon, dark ground
    const horizon = H * 0.66;
    let g = ctx.createLinearGradient(0, 0, 0, horizon);
    g.addColorStop(0, "#04161d");
    g.addColorStop(0.55, "#0b2e38");
    g.addColorStop(0.85, "#6b4a2a");
    g.addColorStop(1, "#d78b3c");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, horizon);
    const sun = ctx.createRadialGradient(W / 2, horizon, 0, W / 2, horizon, W * 0.45);
    sun.addColorStop(0, "rgba(255,190,110,0.75)");
    sun.addColorStop(0.35, "rgba(255,160,80,0.25)");
    sun.addColorStop(1, "rgba(255,160,80,0)");
    ctx.fillStyle = sun; ctx.fillRect(0, 0, W, horizon);
    g = ctx.createLinearGradient(0, horizon, 0, H);
    g.addColorStop(0, "#3a2b20");
    g.addColorStop(0.25, "#241a13");
    g.addColorStop(1, "#120d0a");
    ctx.fillStyle = g; ctx.fillRect(0, horizon, W, H - horizon);
    if (CUR && CUR.scrimMode && CUR.scrimMode !== "none" && CUR.scrim > 0) {
      ctx.fillStyle = CUR.scrimMode === "light"
        ? `rgba(255,255,255,${CUR.scrim})` : `rgba(0,0,0,${CUR.scrim})`;
      ctx.fillRect(0, 0, W, H);
    }
  }
  // top scrim for headline legibility
  const tg = ctx.createLinearGradient(0, 0, 0, H * 0.34);
  tg.addColorStop(0, "rgba(2,10,14,0.5)"); tg.addColorStop(1, "rgba(2,10,14,0)");
  ctx.fillStyle = tg; ctx.fillRect(0, 0, W, H * 0.34);

  const chrome = s.branding === "paid";
  const logo = chrome
    ? drawToyotaLogo(ctx, s, W, H, BRAND.white)
    : Object.assign(logoSpec(W, H), { x: 0, y: logoSpec(W, H).margin, align: s.logoAlign || "right" });
  if (chrome) drawDealerHeader(ctx, s, W, H, logo, BRAND.white);

  // shape decides the composition: portrait = stacked story, square =
  // compact stack, wide = copy column left with the vehicle large on the right
  const portrait = H / W > 1.3;
  const wide = !portrait && W / H > 1.35;
  const kicker = tok(s.kicker, s), h1 = tok(s.h1, s), h2 = tok(s.h2, s);
  const cx = wide ? W * 0.3 : W / 2;
  const colW = wide ? W * 0.46 : W;
  ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";

  // brand furniture first, so copy and vehicles can be fitted around it.
  // The sign-off is suppressed here: the dealership already appears in
  // the header and the "at ..." line of this template.
  let fTop;
  if (chrome) {
    const keep = RULES.showSignOff;
    RULES.showSignOff = false;
    fTop = drawBaseFurniture(ctx, s, W, H, logo, { ink: BRAND.white, surface: "dark" });
    RULES.showSignOff = keep;
  } else {
    fTop = H - logo.margin * 1.2;
    if (s.disclaimer) {
      const dp = Math.max(9, U * 0.016);
      ctx.font = F(dp, 400); ctx.fillStyle = BRAND.white; ctx.globalAlpha = 0.85;
      ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
      const lines = wrapText(ctx, s.disclaimer, W * 0.86);
      let dy = H - logo.margin * 0.6;
      for (let i = lines.length - 1; i >= 0; i--) { ctx.fillText(lines[i], W / 2, dy); dy -= dp * 1.35; }
      ctx.globalAlpha = 1;
      fTop = Math.min(fTop, dy);
    }
  }

  // measure the lower block (sub, pill, dealer line) before anything is
  // drawn, so both the headline stack and the vehicle zone can respect it
  const sub1 = tok(s.sub1, s), pill = tok(s.cta, s), foot = tok(s.foot1, s);
  const pf = foot ? fitText(ctx, foot, colW * (wide ? 0.9 : 0.7), U * 0.032, 500) : 0;
  const pp = pill && s.branding !== "organic" ? U * 0.03 : 0;
  const ps = sub1 ? fitText(ctx, sub1, colW * (wide ? 0.95 : 0.8), U * 0.042, 600) : 0;
  let cur = Math.min(H * (portrait ? 0.84 : 0.86), fTop - U * 0.02);
  const footY = foot ? cur : 0; if (foot) cur -= pf * 1.8;
  const pillY = pp ? cur - pp * 1.05 : 0; if (pp) cur -= pp * 3.05;
  const subY = sub1 ? cur : 0;
  const blockTop = sub1 ? subY - ps
    : pp ? pillY - pp * 1.4
    : foot ? footY - pf : cur;

  // headline stack, shrunk as a unit when the shape leaves less room
  let y = wide
    ? Math.max(logo.margin * 3.2, H * 0.18)
    : (chrome ? logo.y + logo.h : logo.margin) + logo.margin * (portrait ? 1.6 : 0.5);
  let pk = kicker ? fitText(ctx, kicker.toUpperCase(), colW * 0.86, U * (portrait ? 0.037 : 0.04), 600) : 0;
  const base1 = portrait ? H * 0.085 : wide ? H * 0.14 : H * 0.08;
  let p1 = fitText(ctx, h1.toUpperCase(), colW * (wide ? 0.9 : 0.78), base1, 800);
  let p2 = fitText(ctx, h2.toUpperCase(), colW * (wide ? 0.96 : 0.86), base1 * 1.12, 800);
  const gap1 = portrait ? 1.12 : 1.08;
  const stackH = pk + p1 * gap1 + p2 * 1.02;
  const availH = (portrait ? H * 0.62 : wide ? blockTop - U * 0.02 : Math.min(blockTop, H * 0.62) - U * 0.14) - y;
  if (stackH > availH && availH > 0) {
    const k = availH / stackH;
    pk *= k; p1 *= k; p2 *= k;
  }
  ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
  if (kicker) {
    ctx.font = F(pk, 600); ctx.fillStyle = BRAND.white;
    y += pk; ctx.fillText(kicker.toUpperCase(), cx, y);
  }
  ctx.font = F(p1, 800); ctx.fillStyle = BRAND.white;
  y += p1 * gap1; ctx.fillText(h1.toUpperCase(), cx, y);
  ctx.font = F(p2, 800); ctx.fillStyle = s.accent || BRAND.red;
  y += p2 * 1.02; ctx.fillText(h2.toUpperCase(), cx, y);

  // vehicles: portrait/square run across below the headline; wide formats
  // give the right half of the frame to the vehicle
  if (wide) {
    drawOverlayImg(ctx, W * 0.53, H * 0.26, W * 0.44, H * 0.54, true);
  } else if (portrait) {
    const zoneTop = Math.min(y + U * 0.01, H * 0.55);
    const zoneBot = Math.min(H * 0.64, blockTop - U * 0.015);
    drawOverlayImg(ctx, W * 0.03, zoneTop, W * 0.94, Math.max(H * 0.1, zoneBot - zoneTop));
  } else {
    const zoneTop = Math.min(y + U * 0.008, H * 0.55);
    const zoneBot = blockTop - U * 0.015;
    drawOverlayImg(ctx, W * 0.05, zoneTop, W * 0.9, Math.max(H * 0.08, zoneBot - zoneTop));
  }

  // lower block at the positions measured above: sub, pill, dealer line
  if (foot) {
    ctx.font = F(pf, 500); ctx.fillStyle = BRAND.white;
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    ctx.fillText(foot, cx, footY);
  }
  if (pp) {
    drawCtaButton(ctx, pill.toUpperCase(), cx, pillY, pp, BRAND.red, BRAND.white, colW * (wide ? 0.56 : 0.36));
  }
  if (sub1) {
    ctx.font = F(ps, 600); ctx.fillStyle = BRAND.white;
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    ctx.fillText(sub1, cx, subY);
  }

}

/* 8. Big word lineup (after dealer "Electrify"-style ads): giant
   accent-colour display word over the photo, vehicles across the
   middle, white base panel with black headline, sub-copy and pill. */
function drawLineup(ctx, W, H, s, assets, opts) {
  const U = Math.min(W, H);
  const chrome = s.branding === "paid";
  const wide = W / H > 1.35;
  const panelH = H * (wide ? 0.42 : 0.35);
  const panelY = H - panelH;

  if (assets.bg) {
    drawBackground(ctx, W, H, assets, opts, 0.5, 0.4, 0, 0, W, panelY);
  } else {
    // showroom-at-dusk fallback: cool dark stage, warm glow above the panel
    const g = ctx.createLinearGradient(0, 0, W, panelY);
    g.addColorStop(0, "#252b34"); g.addColorStop(0.6, "#141922"); g.addColorStop(1, "#0a0e14");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, panelY);
    const gl = ctx.createLinearGradient(0, panelY - H * 0.2, 0, panelY);
    gl.addColorStop(0, "rgba(255,185,115,0)"); gl.addColorStop(1, "rgba(255,195,125,0.25)");
    ctx.fillStyle = gl; ctx.fillRect(0, panelY - H * 0.2, W, H * 0.2);
    if (CUR && CUR.scrimMode && CUR.scrimMode !== "none" && CUR.scrim > 0) {
      ctx.fillStyle = CUR.scrimMode === "light"
        ? `rgba(255,255,255,${CUR.scrim})` : `rgba(0,0,0,${CUR.scrim})`;
      ctx.fillRect(0, 0, W, panelY);
    }
  }
  const tg = ctx.createLinearGradient(0, 0, 0, H * 0.5);
  tg.addColorStop(0, "rgba(3,7,13,0.6)"); tg.addColorStop(1, "rgba(3,7,13,0)");
  ctx.fillStyle = tg; ctx.fillRect(0, 0, W, H * 0.5);

  const logo = chrome
    ? drawToyotaLogo(ctx, s, W, H, BRAND.white)
    : Object.assign(logoSpec(W, H), { x: 0, y: logoSpec(W, H).margin, align: s.logoAlign || "right" });
  if (chrome) drawDealerHeader(ctx, s, W, H, logo, BRAND.white);

  const kicker = tok(s.kicker, s), giant = (tok(s.giant, s) || "").toUpperCase();
  ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
  let y = chrome ? logo.y + logo.h + logo.margin * 0.6 : logo.margin * (wide ? 1.1 : 2);
  if (kicker) {
    const pk = fitText(ctx, kicker.toUpperCase(), W * 0.8, U * 0.034, 600);
    ctx.font = F(pk, 600); ctx.fillStyle = BRAND.white;
    y += pk; ctx.fillText(kicker.toUpperCase(), W / 2, y);
    y += pk * 0.45;
  }
  if (giant) {
    const pg = fitText(ctx, giant, W * 0.95, H * (wide ? 0.28 : 0.155), 800);
    ctx.font = F(pg, 800); ctx.fillStyle = s.accent || BRAND.red;
    y += pg; ctx.fillText(giant, W / 2, y);
  }

  // white base panel first; vehicles overlap its top edge (in front)
  ctx.fillStyle = BRAND.white; ctx.fillRect(0, panelY, W, panelH);
  const zTop = Math.min(y + U * 0.005, panelY - H * 0.08);
  drawOverlayImg(ctx, W * 0.02, zTop, W * 0.96, panelY + H * 0.02 - zTop);

  // panel copy above the furniture / small print
  let fTop;
  if (chrome) {
    fTop = drawBaseFurniture(ctx, s, W, H, logo, { ink: BRAND.black, surface: "light" });
  } else {
    fTop = H - U * 0.03;
    if (s.disclaimer) {
      const dp = Math.max(8, U * 0.014);
      ctx.font = F(dp, 400); ctx.fillStyle = "#6b7280";
      ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
      const lines = wrapText(ctx, s.disclaimer, W * 0.9);
      let dy = H - U * 0.02;
      for (let i = lines.length - 1; i >= 0; i--) { ctx.fillText(lines[i], W / 2, dy); dy -= dp * 1.3; }
      fTop = dy;
    }
  }
  const h1 = tok(s.h1, s), sub1 = tok(s.sub1, s), cta = tok(s.cta, s);
  ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
  let py = panelY + panelH * 0.05;
  if (h1) {
    const p1 = fitText(ctx, h1.toUpperCase(), W * 0.9, Math.min(panelH * 0.26, H * 0.075), 800);
    ctx.font = F(p1, 800); ctx.fillStyle = BRAND.black;
    py += p1 * 1.15; ctx.fillText(h1.toUpperCase(), W / 2, py);
  }
  if (sub1) {
    const ps = Math.min(U * 0.028, panelH * 0.1);
    ctx.font = F(ps, 600); ctx.fillStyle = "#374151";
    const lines = wrapText(ctx, sub1.toUpperCase(), W * 0.84);
    py += ps * 0.7;
    for (const ln of lines) { py += ps * 1.35; ctx.fillText(ln, W / 2, py); }
  }
  if (cta && s.branding !== "organic") {
    const pp = Math.min(U * 0.028, panelH * 0.1);
    const cy = Math.min(Math.max(py + pp * 2.3, panelY + panelH * 0.7), fTop - pp * 1.4);
    drawCtaButton(ctx, cta.toUpperCase(), W / 2, cy, pp, s.accent || BRAND.red, BRAND.white, W * 0.3);
  }
}

/* 9. Sale burst (after "3 Day Sale" dealer ads): night-sky fireworks
   backdrop, plate line, giant save line, white day-count block,
   vehicles and event name. */
function fireworkBurst(ctx, cx, cy, r, col) {
  ctx.save();
  ctx.strokeStyle = col; ctx.fillStyle = col;
  ctx.lineWidth = Math.max(1, r * 0.018);
  const n = 24;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.sin(cx + i) * 0.05;
    const rr = r * (0.55 + 0.45 * Math.abs(Math.sin(i * 12.9898 + cx * 0.01)));
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * rr * 0.3, cy + Math.sin(a) * rr * 0.3);
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    ctx.stroke();
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, Math.max(0.6, r * 0.022), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawSaleBurst(ctx, W, H, s, assets, opts) {
  const U = Math.min(W, H);
  const chrome = s.branding === "paid";
  const wide = W / H > 1.35;
  if (assets.bg) drawBackground(ctx, W, H, assets, opts, 0.5, 0.4);
  else {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#04070f"); g.addColorStop(0.55, "#0a1026"); g.addColorStop(1, "#05070e");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    [[0.1, 0.09, 0.17, "#ff5a4e"], [0.88, 0.07, 0.2, "#ffc24d"],
     [0.5, 0.05, 0.11, "#8fb0ff"], [0.97, 0.32, 0.1, "#ff8bd6"],
     [0.03, 0.34, 0.09, "#9be7ff"]].forEach(([x, yy, r, c]) =>
      fireworkBurst(ctx, W * x, H * yy, U * r, c));
    if (CUR && CUR.scrimMode && CUR.scrimMode !== "none" && CUR.scrim > 0) {
      ctx.fillStyle = CUR.scrimMode === "light"
        ? `rgba(255,255,255,${CUR.scrim})` : `rgba(0,0,0,${CUR.scrim})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  const logo = chrome ? drawToyotaLogo(ctx, s, W, H, BRAND.white)
    : Object.assign(logoSpec(W, H), { x: 0, y: logoSpec(W, H).margin, align: s.logoAlign || "right" });
  if (chrome) drawDealerHeader(ctx, s, W, H, logo, BRAND.white);

  // base furniture / social small print, measured first
  let fTop;
  if (chrome) {
    fTop = drawBaseFurniture(ctx, s, W, H, logo, { ink: BRAND.white, surface: "dark" });
  } else {
    fTop = H - logo.margin;
    if (s.disclaimer) {
      const dp = Math.max(9, U * 0.015);
      ctx.font = F(dp, 400); ctx.fillStyle = BRAND.white; ctx.globalAlpha = 0.85;
      ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
      const lines = wrapText(ctx, s.disclaimer, W * 0.88);
      let dy = H - logo.margin * 0.5;
      for (let i = lines.length - 1; i >= 0; i--) { ctx.fillText(lines[i], W / 2, dy); dy -= dp * 1.35; }
      ctx.globalAlpha = 1;
      fTop = dy;
    }
  }

  const kicker = tok(s.kicker, s), h1 = tok(s.h1, s), sub1 = tok(s.sub1, s);
  const cta = tok(s.cta, s), days = String(s.days || "").trim();
  const ctaOn = cta && s.branding !== "organic";

  // bottom block positions (event name + pill), bottom-anchored
  const pp = U * 0.028, ps = sub1 ? U * 0.05 : 0;
  let bot = Math.min(H * 0.92, fTop - U * 0.015);
  const ctaY = ctaOn ? bot - pp * 1.05 : 0; if (ctaOn) bot -= pp * 3.1;
  const subY = sub1 ? bot : 0; if (sub1) bot -= ps * 1.5;

  // top stack
  ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
  let y = (chrome ? logo.y + logo.h + logo.margin * 0.4 : logo.margin * (wide ? 1 : 1.8));
  if (kicker) {
    const pk = fitText(ctx, kicker.toUpperCase(), W * 0.7, U * (wide ? 0.06 : 0.047), 700);
    ctx.font = F(pk, 700); ctx.fillStyle = BRAND.white;
    y += pk; ctx.fillText(kicker.toUpperCase(), W / 2, y);
    y += pk * 0.35;
  }
  if (h1) {
    const p1 = fitText(ctx, h1.toUpperCase(), W * 0.94, H * (wide ? 0.17 : 0.082), 800);
    ctx.font = F(p1, 800); ctx.fillStyle = BRAND.white;
    y += p1; ctx.fillText(h1.toUpperCase(), W / 2, y);
  }

  // day-count block: white square with the number + stacked label words
  if (days) {
    const side = U * (wide ? 0.24 : 0.21);
    const words = (tok(s.h2, s) || "").toUpperCase().split(/\s+/).filter(Boolean);
    const lp = side * 0.4;
    ctx.font = F(lp, 800);
    const lw = words.length ? Math.max(...words.map((w) => ctx.measureText(w).width)) : 0;
    const gap = side * 0.14;
    const total = side + (lw ? gap + lw : 0);
    let bx = W / 2 - total / 2 + side / 2;
    let by = y + U * 0.02 + side / 2;
    if (NUDGE.days) { bx += NUDGE.days.dx * W; by += NUDGE.days.dy * H; }
    const rect = { x: bx - side / 2, y: by - side / 2, w: side, h: side };
    if (REC) REC.push({ type: "cta", key: "days", text: days, x: rect.x, y: rect.y, w: side, h: side, px: side * 0.6, bg: BRAND.white, fg: BRAND.black });
    if (!(SUPPRESS && SUPPRESS.cta)) {
      ctx.fillStyle = BRAND.white; ctx.fillRect(rect.x, rect.y, side, side);
      ctx.fillStyle = BRAND.black; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.font = F(side * 0.72, 800);
      (ctx.__origFillText || ctx.fillText.bind(ctx))(days, bx, by + side * 0.03);
    }
    if (words.length) {
      ctx.fillStyle = BRAND.white; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
      ctx.font = F(lp, 800);
      const lh = lp * 1.02;
      let ly = by - ((words.length - 1) * lh) / 2 + lp * 0.36;
      for (const w of words) { ctx.fillText(w, rect.x + side + gap, ly); ly += lh; }
    }
    y = rect.y + side;
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
  }

  // vehicles between the day block and the event name
  const zTop = Math.min(y + U * 0.015, H * 0.68);
  const zBot = sub1 ? subY - ps * 1.15 : ctaOn ? ctaY - pp * 1.7 : fTop - U * 0.01;
  drawOverlayImg(ctx, W * 0.03, zTop, W * 0.94, Math.max(H * 0.07, zBot - zTop));

  if (sub1) {
    const p = fitText(ctx, sub1.toUpperCase(), W * 0.92, ps, 800);
    ctx.font = F(p, 800); ctx.fillStyle = BRAND.white; ctx.globalAlpha = 0.95;
    ctx.fillText(sub1.toUpperCase(), W / 2, subY);
    ctx.globalAlpha = 1;
  }
  if (ctaOn) {
    drawCtaButton(ctx, cta.toUpperCase(), W / 2, ctaY, pp, BRAND.white, BRAND.black, W * 0.28);
  }
}

/* 10. Price pill offer (after bZ4X deposit-bonus story ads): photo
   background, left-aligned offer headline, vehicle, accent price pill
   with driveaway tag, optional CTA pill. */
function drawPriceTag(ctx, W, H, s, assets, opts) {
  const U = Math.min(W, H);
  const chrome = s.branding === "paid";
  const wide = W / H > 1.35;
  drawBackground(ctx, W, H, assets, opts && { hint: false }, 0.5, 0.45);
  const tg = ctx.createLinearGradient(0, 0, 0, H);
  tg.addColorStop(0, "rgba(8,10,14,0.5)"); tg.addColorStop(0.45, "rgba(8,10,14,0.12)"); tg.addColorStop(1, "rgba(8,10,14,0.5)");
  ctx.fillStyle = tg; ctx.fillRect(0, 0, W, H);

  const logo = chrome ? drawToyotaLogo(ctx, s, W, H, BRAND.white)
    : Object.assign(logoSpec(W, H), { x: 0, y: logoSpec(W, H).margin, align: s.logoAlign || "right" });
  if (chrome) drawDealerHeader(ctx, s, W, H, logo, BRAND.white);

  const mx = W * 0.07;
  const colW = W * (wide ? 0.46 : 0.86);
  const kicker = tok(s.kicker, s), h1 = tok(s.h1, s), tag = tok(s.tagline, s), cta = tok(s.cta, s);

  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  let y = (chrome ? logo.y + logo.h : logo.margin) + logo.margin * (wide ? 0.7 : 1.1);
  if (kicker) {
    const pk = fitText(ctx, kicker, colW, U * 0.034, 600);
    ctx.font = F(pk, 600); ctx.fillStyle = BRAND.white;
    y += pk; ctx.fillText(kicker, mx, y);
    y += pk * 0.35;
  }
  if (h1) {
    let p1 = U * (wide ? 0.1 : 0.088);
    ctx.font = F(p1, 800);
    let lines = wrapText(ctx, h1, colW);
    if (lines.length > 2) { p1 *= 0.85; ctx.font = F(p1, 800); lines = wrapText(ctx, h1, colW); }
    ctx.fillStyle = BRAND.white;
    for (const ln of lines) { y += p1 * 1.06; ctx.fillText(ln, mx, y); }
  }

  let fTop;
  if (chrome) {
    fTop = drawBaseFurniture(ctx, s, W, H, logo, { ink: BRAND.white, surface: "dark" });
  } else {
    fTop = H - logo.margin;
    if (s.disclaimer) {
      const dp = Math.max(8, U * 0.014);
      ctx.font = F(dp, 400); ctx.fillStyle = BRAND.white; ctx.globalAlpha = 0.8;
      ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
      const lines = wrapText(ctx, s.disclaimer, W * 0.86);
      let dy = H - logo.margin * 0.5;
      for (let i = lines.length - 1; i >= 0; i--) { ctx.fillText(lines[i], mx, dy); dy -= dp * 1.3; }
      ctx.globalAlpha = 1;
      fTop = dy;
    }
  }

  const ctaOn = cta && s.branding !== "organic";
  const pillPx = U * 0.036, cp = U * 0.026;
  const rowY = Math.min(H * (wide ? 0.8 : 0.78), fTop - pillPx * (ctaOn ? 4.4 : 1.6));

  // vehicle: right half on wide, centred band otherwise
  if (wide) {
    drawOverlayImg(ctx, W * 0.5, H * 0.24, W * 0.46, H * 0.58, true);
  } else {
    const zTop = Math.min(y + U * 0.01, H * 0.55);
    drawOverlayImg(ctx, W * 0.04, zTop, W * 0.92, Math.max(H * 0.08, rowY - pillPx * 2 - zTop));
  }

  // price pill + stacked driveaway tag
  let tx = mx;
  if (s.price) {
    ctx.font = F(pillPx, 700);
    const pw = Math.max(W * 0.2, ctx.measureText(s.price).width + pillPx * 2.4);
    drawCtaButton(ctx, s.price, mx + pw / 2, rowY, pillPx, s.accent || BRAND.red, BRAND.white, pw, "price");
    tx = mx + pw + U * 0.028;
  }
  if (tag) {
    const words = tag.toUpperCase().split(/\s+/).filter(Boolean);
    const tp = pillPx * 0.82;
    ctx.font = F(tp, 800); ctx.fillStyle = BRAND.white;
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    const lh = tp * 1.04;
    let ty = rowY - ((words.length - 1) * lh) / 2 + tp * 0.36;
    for (const w of words) { ctx.fillText(w, tx, ty); ty += lh; }
  }
  if (ctaOn) {
    ctx.font = F(cp, 600);
    const cw = Math.max(W * 0.22, ctx.measureText(cta.toUpperCase()).width + cp * 2.2);
    drawCtaButton(ctx, cta.toUpperCase(), mx + cw / 2, Math.min(rowY + pillPx * 3.2, fTop - cp * 1.4),
      cp, BRAND.white, BRAND.black, cw);
  }
}

const TEMPLATE_RENDERERS = {
  fullbleed: drawFullBleed,
  rangehero: drawRangeHero,
  strip: drawStrip,
  colourbg: drawColourBg,
  offer: drawOffer,
  spotlight: drawSpotlight,
  event: drawEvent,
  lineup: drawLineup,
  saleburst: drawSaleBurst,
  pricetag: drawPriceTag,
};

function renderAd(canvas, size, templateId, state, assets, opts = {}) {
  canvas.width = size.w;
  canvas.height = size.h;
  const ctx = canvas.getContext("2d");
  CUR = state; CUR_ASSETS = assets;

  if (!ctx.__origFillText) {
    ctx.__origFillText = ctx.fillText.bind(ctx);
    ctx.fillText = function (text, x, y) {
      text = String(text);
      const lookup = ctx.__lookup;
      const key = lookup ? (lookup.get(text) || lookup.get(text.trim()) || null) : null;
      const n = key && NUDGE[key];
      if (n) { x += n.dx * canvas.width; y += n.dy * canvas.height; }
      if (REC) {
        const fm = /(\d+(?:\.\d+)?)px/.exec(ctx.font);
        const wm = /^(\d+)/.exec(ctx.font);
        REC.push({
          type: "text", key, text, x, y,
          w: ctx.measureText(text).width,
          px: fm ? +fm[1] : 16, weight: wm ? +wm[1] : 400,
          align: ctx.textAlign, baseline: ctx.textBaseline,
          color: String(ctx.fillStyle),
        });
      }
      if (SUPPRESS && SUPPRESS.text) return;
      ctx.__origFillText(text, x, y);
    };
  }
  ctx.__lookup = buildNudgeLookup(state);

  ctx.clearRect(0, 0, size.w, size.h);
  if (Math.min(size.w, size.h) <= 300 && size.w > size.h) {
    drawMicro(ctx, size.w, size.h, state, assets, opts);
  } else {
    (TEMPLATE_RENDERERS[templateId] || drawFullBleed)(ctx, size.w, size.h, state, assets, opts);
  }
}

function renderAdLayers(size, templateId, state, assets) {
  const c = document.createElement("canvas");
  REC = [];
  renderAd(c, size, templateId, state, assets, { hint: false });
  const layers = REC;
  REC = null;
  return layers;
}

function renderAdBackground(size, templateId, state, assets) {
  const c = document.createElement("canvas");
  SUPPRESS = { text: 1, cta: 1, logo: 1, owaf: 1, overlay: 1, vehicle: 1 };
  renderAd(c, size, templateId, state, assets, { hint: false });
  SUPPRESS = null;
  return c;
}
