/* ============================================================
   Canvas rendering engine.
   renderAd(canvas, {w,h}, templateId, state, assets, opts)
   draws one finished ad at exact pixel size.

   state:  field values from the form (already token-replaced
           where needed via tok()).
   assets: { bg: Image|null, logo: Image|null }
   opts:   { hint: true } shows "add a photo" helper text on
           previews when no background image is loaded.
   ============================================================ */

/* Masterbrand typography: Toyota Type is the only brand font; where it
   is unavailable, Arial must be used. Upload Toyota Type in the app
   (registered as "BrandFont") and it takes priority automatically. */
const FONT_STACK = `"BrandFont","Toyota Type",Arial,"Helvetica Neue",sans-serif`;

function F(px, weight = 800) {
  return `${weight} ${Math.round(px)}px ${FONT_STACK}`;
}

/* Replace tokens in template text with live field values. */
function tok(str, s) {
  if (!str) return "";
  return str
    .replaceAll("{MODEL}", (s.model || "").toUpperCase())
    .replaceAll("{GRADE}", (s.grade || "").toUpperCase())
    .replaceAll("{COLOUR}", s.colour || "")
    .replaceAll("{PRICE}", s.price || "")
    .replaceAll("{DEALER}", s.dealer || "");
}

/* Cover-fit an image into a rect (like CSS background-size: cover). */
function drawCover(ctx, img, x, y, w, h, fx = 0.5, fy = 0.5) {
  const ir = img.width / img.height, rr = w / h;
  let sw, sh;
  if (ir > rr) { sh = img.height; sw = sh * rr; }
  else { sw = img.width; sh = sw / rr; }
  const sx = (img.width - sw) * fx;
  const sy = (img.height - sh) * fy;
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

/* Contain-fit an image into a rect, anchored centre. */
function drawContain(ctx, img, x, y, w, h) {
  const r = Math.min(w / img.width, h / img.height);
  const dw = img.width * r, dh = img.height * r;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

/* Shrink font size until text fits maxWidth. Returns final px. */
function fitText(ctx, text, maxWidth, basePx, weight = 800, minPx = 10) {
  let px = basePx;
  ctx.font = F(px, weight);
  while (px > minPx && ctx.measureText(text).width > maxWidth) {
    px -= Math.max(1, px * 0.04);
    ctx.font = F(px, weight);
  }
  return px;
}

/* Word-wrap text to maxWidth with the current ctx.font. */
function wrapText(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line); line = w;
    } else line = test;
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

/* Placeholder background used when no photo has been uploaded. */
function drawPlaceholderBg(ctx, W, H, hint) {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, "#3a3f46");
  g.addColorStop(0.55, "#20242a");
  g.addColorStop(1, "#101317");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.globalAlpha = 0.08;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = Math.max(2, W * 0.004);
  for (let i = 1; i <= 3; i++) {
    ctx.beginPath();
    ctx.arc(W * 0.15, H * 1.1, Math.min(W, H) * 0.35 * i, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
  if (hint) {
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = "#ffffff";
    const px = Math.max(12, Math.min(W, H) * 0.035);
    ctx.font = F(px, 600);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Upload a vehicle / background photo", W / 2, H / 2);
    ctx.restore();
  }
}

/* Current render pass (set by renderAd) so deep helpers can read the
   layer controls without threading state through every call. */
let CUR = null, CUR_ASSETS = { bg: null, logo: null, owaf: null, overlay: null };

function drawBackground(ctx, W, H, assets, opts, fx = 0.5, fy = 0.5, x = 0, y = 0, w = null, h = null) {
  w = w == null ? W : w; h = h == null ? H : h;
  if (assets.bg) drawCover(ctx, assets.bg, x, y, w, h, fx, fy);
  else {
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.translate(x, y);
    drawPlaceholderBg(ctx, w, h, opts.hint);
    ctx.restore();
  }
  // user-controlled wash over the background for text legibility
  if (CUR && CUR.scrimMode && CUR.scrimMode !== "none" && CUR.scrim > 0) {
    ctx.fillStyle = CUR.scrimMode === "light"
      ? `rgba(255,255,255,${CUR.scrim})`
      : `rgba(0,0,0,${CUR.scrim})`;
    ctx.fillRect(x, y, w, h);
  }
}

/* Vehicle cutout overlay: contain-fit into a region, bottom-anchored,
   with user size (ovScale) and left/centre/right position (ovPos).
   Returns the drawn rect, or null when no overlay is loaded. */
function drawOverlayImg(ctx, x, y, w, h) {
  const img = CUR_ASSETS.overlay;
  if (!img) return null;
  const scale = CUR && CUR.ovScale ? CUR.ovScale : 0.9;
  const r = Math.min(w / img.width, h / img.height) * scale;
  const dw = img.width * r, dh = img.height * r;
  let dx = x + (w - dw) / 2;
  if (CUR && CUR.ovPos === "left") dx = x + w * 0.02;
  if (CUR && CUR.ovPos === "right") dx = x + w - dw - w * 0.02;
  const dy = y + h - dh;
  putImage(ctx, "overlay", img, dx, dy, dw, dh);
  return { x: dx, y: dy, w: dw, h: dh };
}

/* ---- Layer recording & text nudging ----------------------------------
   REC:      when set to an array, every text, image, and CTA drawn is
             recorded into it (used for drag hit-testing and the layered
             PPTX export).
   SUPPRESS: when set, matching element kinds are recorded but not
             painted (used to produce the flattened background layer).
   NUDGE:    per-field {dx,dy} offsets (fractions of canvas size) applied
             wherever that field's text is drawn — this is what dragging
             text on a preview writes to. */
let REC = null;
let SUPPRESS = null;
const NUDGE = {};

const NUDGE_KEYS = ["h1", "h2", "h3", "h2accent", "sub1", "sub2", "pill",
  "tagline", "kicker", "giant", "bar", "offer", "offerLabel", "hashtag",
  "month", "foot1", "foot2"];

function buildNudgeLookup(s) {
  const m = new Map();
  for (const k of NUDGE_KEYS) {
    const v = tok(s[k], s);
    if (v) { m.set(v, k); m.set(v.toUpperCase(), k); }
  }
  if (s.price) { m.set(s.price, "price"); m.set(s.price + "*", "price"); }
  return m;
}

/* Record/suppress-aware image painter for logo, OWAF, and overlay. */
function putImage(ctx, kind, img, x, y, w, h) {
  if (REC) REC.push({ type: "img", kind, img, x, y, w, h });
  if (SUPPRESS && SUPPRESS[kind]) return;
  ctx.drawImage(img, x, y, w, h);
}

/* Average luminance (0..1) of a canvas region — used to pick ink that
   stays legible over whatever photo sits underneath. */
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
      sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      n++;
    }
    return n ? sum / (n * 255) : 0.35;
  } catch { return 0.35; }
}
function autoInk(ctx, x, y, w, h) {
  return luminanceAt(ctx, x, y, w, h) > 0.6 ? "#1A1A1A" : "#FFFFFF";
}

/* Tint a monochrome-ink transparent image to a solid colour. */
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

/* Dealer identity block: built-in composite lockup (tinted to suit the
   template), a custom uploaded logo + name, or the name as text. */
function drawDealerMark(ctx, s, assets, x, y, maxW, px, colour, align = "left") {
  // "auto": sample what's behind the mark and pick legible ink
  if (colour === "auto") colour = autoInk(ctx, x, y - px * 1.4, maxW, px * 2.8);
  if (!assets.logo && assets.logoPack && assets.logoPack.h) {
    const img = tinted(assets.logoPack.h, colour);
    let h = px * 2.7;
    let w = img.width * (h / img.height);
    if (w > maxW) { w = maxW; h = img.height * (w / img.width); }
    const lx = align === "right" ? x + maxW - w : x;
    putImage(ctx, "logo", img, lx, y - h / 2, w, h);
    return;
  }
  ctx.save();
  ctx.textBaseline = "middle";
  let cursor = x;
  const logoH = px * 1.9;
  if (assets.logo) {
    const lw = assets.logo.width * (logoH / assets.logo.height);
    if (align === "left") {
      putImage(ctx, "logo", assets.logo, cursor, y - logoH / 2, lw, logoH);
      cursor += lw + px * 0.6;
    } else {
      // right aligned: name then logo from the right edge
      ctx.font = F(px, 700);
      const nameW = s.dealer ? ctx.measureText(s.dealer).width : 0;
      const total = lw + (nameW ? px * 0.6 + nameW : 0);
      let lx = x + maxW - total;
      putImage(ctx, "logo", assets.logo, lx, y - logoH / 2, lw, logoH);
      if (s.dealer) {
        ctx.fillStyle = colour;
        ctx.textAlign = "left";
        ctx.fillText(s.dealer, lx + lw + px * 0.6, y);
      }
      ctx.restore();
      return;
    }
  }
  if (s.dealer) {
    ctx.fillStyle = colour;
    if (align === "left") {
      ctx.textAlign = "left";
      const fpx = fitText(ctx, s.dealer, maxW - (cursor - x), px, 700);
      ctx.font = F(fpx, 700);
      ctx.fillText(s.dealer, cursor, y);
    } else {
      ctx.textAlign = "right";
      const fpx = fitText(ctx, s.dealer, maxW, px, 700);
      ctx.font = F(fpx, 700);
      ctx.fillText(s.dealer, x + maxW, y);
    }
  }
  ctx.restore();
}

/* Small-print disclaimer along the bottom. */
function drawDisclaimer(ctx, s, W, H, colour, pad) {
  if (!s.disclaimer) return;
  ctx.save();
  const px = Math.max(9, Math.min(W, H) * 0.016);
  ctx.font = F(px, 500);
  ctx.fillStyle = colour;
  ctx.globalAlpha = 0.85;
  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";
  const lines = wrapText(ctx, s.disclaimer, W - pad * 2);
  let y = H - pad * 0.6;
  for (let i = lines.length - 1; i >= 0; i--) {
    ctx.fillText(lines[i], pad, y);
    y -= px * 1.3;
  }
  ctx.restore();
}

/* CTA pill button. Returns its rect. */
function drawCtaButton(ctx, text, cx, cy, px, bg, fg, minW = 0) {
  if (NUDGE.cta) {
    cx += NUDGE.cta.dx * ctx.canvas.width;
    cy += NUDGE.cta.dy * ctx.canvas.height;
  }
  ctx.font = F(px, 700);
  const tw = ctx.measureText(text).width;
  const w = Math.max(minW, tw + px * 2.4);
  const h = px * 2.2;
  const rect = { x: cx - w / 2, y: cy - h / 2, w, h };
  if (REC) REC.push({ type: "cta", key: "cta", text, x: rect.x, y: rect.y, w, h, px, bg, fg });
  if (SUPPRESS && SUPPRESS.cta) return rect;
  roundRectPath(ctx, rect.x, rect.y, w, h, h / 2);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  (ctx.__origFillText || ctx.fillText.bind(ctx))(text, cx, cy + px * 0.06);
  return rect;
}

/* ================= TEMPLATES ================= */

/* 1. Stock arrival — photo + big dark circular panel. */
function drawArrival(ctx, W, H, s, assets, opts) {
  const portrait = H / W > 1.3;
  drawBackground(ctx, W, H, assets, opts, portrait ? 0.5 : 0.3, 0.5);

  if (!portrait) {
    // Dark circle panel on the right — photo keeps ~45% of the canvas
    const landscape = W / H > 1.4;
    const edge = W * (landscape ? 0.46 : 0.4); // panel's left edge at mid-height
    const r = H * (landscape ? 1.0 : 0.92);
    const cx = edge + r, cy = H * 0.5;
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(8,8,10,0.94)"; ctx.fill();
    ctx.restore();
    drawOverlayImg(ctx, 0, H * 0.2, edge + W * 0.06, H * 0.72);

    const tx = edge + W * 0.06;
    const colW = W - tx - W * 0.04;
    const cxT = tx + colW / 2;

    // right-aligned so the lockup stays on the dark panel
    drawDealerMark(ctx, s, assets, W * 0.52, H * 0.11, W * 0.44,
      Math.min(W, H) * 0.03, "#fff", "right");

    ctx.textAlign = "center";
    let y = H * 0.36;
    ctx.textBaseline = "alphabetic";
    const h1 = tok(s.h1, s), h2 = tok(s.h2, s);
    let px1 = fitText(ctx, h1, colW, Math.min(W, H) * 0.24, 900);
    ctx.font = F(px1, 900); ctx.fillStyle = s.accent;
    ctx.fillText(h1, cxT, y);
    y += px1 * 0.95;
    let px2 = fitText(ctx, h2, colW, Math.min(W, H) * 0.24, 900);
    ctx.font = F(px2, 900); ctx.fillStyle = "#fff";
    ctx.fillText(h2, cxT, y);

    y += Math.min(W, H) * 0.06;
    ctx.strokeStyle = "#fff"; ctx.lineWidth = Math.max(2, H * 0.004);
    ctx.beginPath();
    ctx.moveTo(cxT - colW * 0.32, y); ctx.lineTo(cxT + colW * 0.32, y);
    ctx.stroke();

    y += Math.min(W, H) * 0.075;
    const sub1 = tok(s.sub1, s), sub2 = tok(s.sub2, s);
    let ps = fitText(ctx, sub1, colW * 0.85, Math.min(W, H) * 0.055, 900);
    ctx.font = F(ps, 900); ctx.fillStyle = s.accent;
    ctx.fillText(sub1, cxT, y);
    y += ps * 1.25;
    ps = fitText(ctx, sub2, colW * 0.85, Math.min(W, H) * 0.05, 800);
    ctx.font = F(ps, 800); ctx.fillStyle = "#fff";
    ctx.fillText(sub2, cxT, y);

    if (s.tagline) {
      const ty = H * 0.86;
      const tp = fitText(ctx, "📍 " + tok(s.tagline, s), colW * 0.9, Math.min(W, H) * 0.036, 600);
      ctx.font = F(tp, 600); ctx.fillStyle = "#fff";
      ctx.fillText("📍 " + tok(s.tagline, s), cxT, ty);
    }
    drawDisclaimer(ctx, s, W, H, "#fff", W * 0.03);
  } else {
    // Portrait: photo top, dark bulge panel bottom
    const panelTop = H * 0.5;
    const R = W * 1.4;
    ctx.save();
    ctx.beginPath();
    ctx.arc(W / 2, panelTop + R, R, 0, Math.PI * 2);
    ctx.rect(0, panelTop + R, W, H - panelTop);
    ctx.fillStyle = "rgba(8,8,10,0.96)"; ctx.fill();
    ctx.restore();
    drawOverlayImg(ctx, 0, H * 0.1, W, H * 0.44);

    const cxT = W / 2, colW = W * 0.86;
    drawDealerMark(ctx, s, assets, W * 0.07, H * 0.06, W * 0.86, W * 0.035, "auto");

    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    let y = panelTop + H * 0.12;
    const h1 = tok(s.h1, s), h2 = tok(s.h2, s);
    let px1 = fitText(ctx, h1, colW, W * 0.22, 900);
    ctx.font = F(px1, 900); ctx.fillStyle = s.accent;
    ctx.fillText(h1, cxT, y);
    y += px1 * 0.95;
    let px2 = fitText(ctx, h2, colW, W * 0.22, 900);
    ctx.font = F(px2, 900); ctx.fillStyle = "#fff";
    ctx.fillText(h2, cxT, y);

    y += H * 0.03;
    ctx.strokeStyle = "#fff"; ctx.lineWidth = Math.max(2, H * 0.003);
    ctx.beginPath();
    ctx.moveTo(cxT - colW * 0.3, y); ctx.lineTo(cxT + colW * 0.3, y);
    ctx.stroke();

    y += H * 0.05;
    const sub1 = tok(s.sub1, s), sub2 = tok(s.sub2, s);
    let ps = fitText(ctx, sub1, colW * 0.8, W * 0.06, 900);
    ctx.font = F(ps, 900); ctx.fillStyle = s.accent;
    ctx.fillText(sub1, cxT, y);
    y += ps * 1.3;
    ps = fitText(ctx, sub2, colW * 0.8, W * 0.055, 800);
    ctx.font = F(ps, 800); ctx.fillStyle = "#fff";
    ctx.fillText(sub2, cxT, y);

    if (s.tagline) {
      ctx.font = F(W * 0.035, 600); ctx.fillStyle = "#fff";
      ctx.fillText("📍 " + tok(s.tagline, s), cxT, H * 0.9);
    }
    drawDisclaimer(ctx, s, W, H, "#fff", W * 0.05);
  }
}

/* 2. Clearance — stacked headline over the photo. */
function drawClearance(ctx, W, H, s, assets, opts) {
  drawBackground(ctx, W, H, assets, opts, 0.5, 0.6);
  // soft light wash top for legibility
  const g = ctx.createLinearGradient(0, 0, 0, H * 0.55);
  g.addColorStop(0, "rgba(255,255,255,0.55)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H * 0.55);
  drawOverlayImg(ctx, 0, H * 0.38, W, H * 0.56);

  const pad = W * 0.06;
  drawDealerMark(ctx, s, assets, pad, H * 0.08, W - pad * 2, Math.min(W, H) * 0.032, "#111", "right");

  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  const maxW = W * 0.82;
  let y = H * (H / W > 1.3 ? 0.16 : 0.2);

  const h1 = tok(s.h1, s);
  let p1 = fitText(ctx, h1, maxW, Math.min(W, H) * 0.115, 900);
  ctx.font = F(p1, 900); ctx.fillStyle = "#111";
  ctx.fillText(h1, pad, y + p1);
  y += p1 * 1.5;

  const h2 = tok(s.h2, s);
  let p2 = fitText(ctx, h2, maxW, Math.min(W, H) * 0.135, 900);
  ctx.font = F(p2, 900); ctx.fillStyle = s.accent;
  ctx.fillText(h2, pad, y + p2);
  y += p2 * 1.35;

  const h3 = tok(s.h3, s);
  if (h3) {
    let p3 = fitText(ctx, h3, maxW * 0.6, Math.min(W, H) * 0.055, 900);
    ctx.font = F(p3, 900); ctx.fillStyle = "#111";
    ctx.fillText(h3, pad, y + p3);
  }

  if (s.price) {
    ctx.textAlign = "left";
    const ptxt = `FROM ${s.price}* DRIVEAWAY`;
    const pp = fitText(ctx, ptxt, W * 0.8, Math.min(W, H) * 0.04, 800);
    ctx.font = F(pp, 800);
    const tw = ctx.measureText(ptxt).width;
    const bx = pad, by = H * 0.86;
    roundRectPath(ctx, bx, by - pp * 1.5, tw + pp * 1.6, pp * 2.1, pp * 0.35);
    ctx.fillStyle = "rgba(0,0,0,0.75)"; ctx.fill();
    ctx.fillStyle = "#fff"; ctx.textBaseline = "middle";
    ctx.fillText(ptxt, bx + pp * 0.8, by - pp * 0.42);
    ctx.textBaseline = "alphabetic";
  }
  drawDisclaimer(ctx, s, W, H, H / W > 1.3 ? "#fff" : "#111", pad * 0.7);
}

/* 3. Driveaway price — big price over photo + pill. */
function drawDriveaway(ctx, W, H, s, assets, opts) {
  drawBackground(ctx, W, H, assets, opts, 0.5, 0.45);
  // dark vignette for text legibility
  const g = ctx.createLinearGradient(0, 0, W * 0.9, 0);
  g.addColorStop(0, "rgba(0,0,0,0.55)");
  g.addColorStop(1, "rgba(0,0,0,0.05)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  drawOverlayImg(ctx, W * 0.28, H * 0.32, W * 0.7, H * 0.58);

  const pad = W * 0.07;
  drawDealerMark(ctx, s, assets, pad, H * 0.08, W - pad * 2, Math.min(W, H) * 0.032, "auto");

  const portrait = H / W > 1.3;
  const maxW = W * (portrait ? 0.86 : 0.6);
  let y = H * (portrait ? 0.3 : 0.34);

  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  const h1 = tok(s.h1, s) || (s.price ? s.price + "*" : "");
  let p1 = fitText(ctx, h1, maxW, Math.min(W, H) * 0.13, 900);
  ctx.font = F(p1, 900); ctx.fillStyle = "#fff";
  ctx.fillText(h1, pad, y + p1);
  y += p1 * 1.12;

  const h2 = tok(s.h2, s);
  if (h2) {
    let p2 = fitText(ctx, h2, maxW, Math.min(W, H) * 0.105, 900);
    ctx.font = F(p2, 900); ctx.fillStyle = "#fff";
    ctx.fillText(h2, pad, y + p2);
    y += p2 * 1.4;
  }

  const pill = tok(s.pill, s);
  if (pill) {
    const pp = fitText(ctx, pill, maxW * 0.9, Math.min(W, H) * 0.032, 700);
    ctx.font = F(pp, 700);
    const tw = ctx.measureText(pill).width;
    const bw = tw + pp * 3, bh = pp * 2.6;
    roundRectPath(ctx, pad, y, bw, bh, bh / 2);
    ctx.strokeStyle = "#fff"; ctx.lineWidth = Math.max(2, H * 0.004);
    ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(pill, pad + bw / 2, y + bh / 2 + pp * 0.05);
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  }

  // model / grade line bottom
  const detail = [s.model, s.grade, s.colour].filter(Boolean).join("  •  ").toUpperCase();
  if (detail) {
    const dp = fitText(ctx, detail, W * 0.85, Math.min(W, H) * 0.03, 700);
    ctx.font = F(dp, 700); ctx.fillStyle = "#fff";
    ctx.fillText(detail, pad, H * 0.9);
  }
  drawDisclaimer(ctx, s, W, H, "#fff", pad * 0.6);
}

/* 4. Announcement — photo block + text block + CTA bar. */
function drawAnnounce(ctx, W, H, s, assets, opts) {
  const landscape = W / H > 1.4;
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);

  const h1 = tok(s.h1, s), sub1 = tok(s.sub1, s), cta = tok(s.cta, s);

  if (!landscape) {
    const photoH = H * 0.56;
    drawBackground(ctx, W, H, assets, opts, 0.5, 0.4, 0, 0, W, photoH);
    drawOverlayImg(ctx, 0, 0, W, photoH + H * 0.04);
    drawDealerMark(ctx, s, assets, W * 0.05, H * 0.05, W * 0.9, Math.min(W, H) * 0.03, "auto");

    const pad = W * 0.06;
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    let y = photoH + H * 0.035;
    let p1 = Math.min(W, H) * 0.062;
    ctx.font = F(p1, 900); ctx.fillStyle = "#111";
    let lines = wrapText(ctx, h1, W - pad * 2);
    if (lines.length > 3) { p1 *= 0.8; ctx.font = F(p1, 900); lines = wrapText(ctx, h1, W - pad * 2); }
    for (const ln of lines) { y += p1 * 1.06; ctx.fillText(ln, pad, y); }

    if (sub1) {
      y += p1 * 0.9;
      const ps = fitText(ctx, sub1, W - pad * 2, p1 * 0.42, 800);
      ctx.font = F(ps, 800); ctx.fillStyle = "#333";
      ctx.fillText(sub1, pad, y);
    }

    // CTA bar
    const barH = Math.max(H * 0.075, Math.min(W, H) * 0.08);
    const barY = H - barH - (s.disclaimer ? H * 0.05 : 0);
    ctx.fillStyle = s.accent;
    ctx.fillRect(0, barY, W, barH);
    const cp = barH * 0.36;
    ctx.font = F(cp, 700); ctx.fillStyle = "#fff";
    ctx.textBaseline = "middle";
    ctx.fillText(cta, pad, barY + barH / 2 + cp * 0.05);
    ctx.textAlign = "right";
    ctx.fillText("›", W - pad, barY + barH / 2 + cp * 0.05);
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    drawDisclaimer(ctx, s, W, H, "#555", pad * 0.7);
  } else {
    const photoW = W * 0.58;
    drawBackground(ctx, W, H, assets, opts, 0.5, 0.45, 0, 0, photoW, H);
    drawOverlayImg(ctx, 0, H * 0.15, photoW, H * 0.75);
    drawDealerMark(ctx, s, assets, W * 0.03, H * 0.09, photoW * 0.9, Math.min(W, H) * 0.045, "auto");

    const pad = W * 0.04;
    const tx = photoW + pad, tw = W - photoW - pad * 2;
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    let y = H * 0.16;
    let p1 = H * 0.085;
    ctx.font = F(p1, 900); ctx.fillStyle = "#111";
    let lines = wrapText(ctx, h1, tw);
    if (lines.length > 4) { p1 *= 0.8; ctx.font = F(p1, 900); lines = wrapText(ctx, h1, tw); }
    for (const ln of lines) { y += p1 * 1.08; ctx.fillText(ln, tx, y); }

    if (sub1) {
      y += p1 * 0.8;
      const ps = fitText(ctx, sub1, tw, p1 * 0.42, 800);
      ctx.font = F(ps, 800); ctx.fillStyle = "#333";
      ctx.fillText(sub1, tx, y);
    }

    const bp = H * 0.05;
    drawCtaButton(ctx, cta, tx + tw / 2, H * 0.82, bp, s.accent, "#fff", tw * 0.7);
    drawDisclaimer(ctx, s, W, H, "#555", pad);
  }
}

/* 5. Seasonal promo — headline top, photo centre, CTA button. */
function drawPromo(ctx, W, H, s, assets, opts) {
  // light misty background
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#dfe7ee");
  g.addColorStop(0.5, "#eef2f5");
  g.addColorStop(1, "#e3e8ec");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  const pad = W * 0.06;
  drawDealerMark(ctx, s, assets, pad, H * 0.055, W - pad * 2, Math.min(W, H) * 0.03, "#222");

  const h1 = tok(s.h1, s), h2 = tok(s.h2, s), cta = tok(s.cta, s);
  ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
  let y = H * 0.14;
  const p1 = fitText(ctx, h1, W * 0.84, Math.min(W, H) * 0.055, 900);
  ctx.font = F(p1, 900); ctx.fillStyle = "#111";
  ctx.fillText(h1, W / 2, y + p1);
  y += p1 * 1.35;
  const p2 = fitText(ctx, h2, W * 0.88, Math.min(W, H) * 0.085, 900);
  ctx.font = F(p2, 900); ctx.fillStyle = s.accent;
  ctx.fillText(h2, W / 2, y + p2);
  y += p2 * 1.3;

  // photo band
  const bandY = y + H * 0.02;
  const bandH = H * 0.78 - bandY;
  if (assets.overlay) drawOverlayImg(ctx, W * 0.05, bandY, W * 0.9, bandH);
  else if (assets.bg) drawContain(ctx, assets.bg, W * 0.05, bandY, W * 0.9, bandH);
  else {
    ctx.save(); ctx.globalAlpha = 0.35;
    roundRectPath(ctx, W * 0.08, bandY, W * 0.84, bandH, W * 0.02);
    ctx.fillStyle = "#b9c2ca"; ctx.fill();
    if (opts.hint) {
      ctx.globalAlpha = 0.8; ctx.fillStyle = "#38414a";
      ctx.font = F(Math.min(W, H) * 0.03, 600);
      ctx.textBaseline = "middle";
      ctx.fillText("Upload a vehicle photo", W / 2, bandY + bandH / 2);
    }
    ctx.restore();
  }

  // detail line + CTA
  const detail = [s.model, s.grade, s.price ? "from " + s.price + "*" : ""].filter(Boolean).join("  •  ");
  if (detail) {
    const dp = fitText(ctx, detail, W * 0.85, Math.min(W, H) * 0.028, 700);
    ctx.font = F(dp, 700); ctx.fillStyle = "#222";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(detail, W / 2, H * 0.83);
  }
  drawCtaButton(ctx, cta.toUpperCase(), W / 2, H * 0.895, Math.min(W, H) * 0.028, s.accent, "#fff");
  drawDisclaimer(ctx, s, W, H, "#555", pad * 0.6);
}

/* Micro layouts for MREC 300×250 and leaderboard 728×90. */
function drawMicro(ctx, W, H, s, assets, opts) {
  const leaderboard = W / H > 3;
  ctx.fillStyle = BRAND.charcoal; ctx.fillRect(0, 0, W, H);

  const h1 = (tok(s.h1, s) + " " + tok(s.h2, s)).trim()
    || (tok(s.giant, s) || "").toUpperCase() || "NEW STOCK HAS LANDED";
  const cta = tok(s.cta, s) || "Learn more";

  if (leaderboard) {
    // photo strip left
    const photoW = W * 0.24;
    drawBackground(ctx, W, H, assets, opts && { hint: false }, 0.5, 0.5, 0, 0, photoW, H);
    let x = photoW + W * 0.02;
    ctx.textBaseline = "middle"; ctx.textAlign = "left";
    if (s.dealer) {
      const dp = fitText(ctx, s.dealer, W * 0.2, H * 0.22, 700);
      ctx.font = F(dp, 700); ctx.fillStyle = "#fff";
      ctx.fillText(s.dealer, x, H * 0.28);
    }
    // CTA anchored to the right edge, price to its left, headline in between
    const bp = H * 0.24;
    ctx.font = F(bp, 700);
    const btnW = ctx.measureText(cta).width + bp * 2.4;
    const btnCx = W - H * 0.15 - btnW / 2;
    let rightEdge = btnCx - btnW / 2 - W * 0.015;
    if (s.price) {
      const pp = fitText(ctx, s.price + "*", W * 0.14, H * 0.3, 900);
      ctx.font = F(pp, 900); ctx.fillStyle = "#fff"; ctx.textAlign = "right";
      ctx.fillText(s.price + "*", rightEdge, H * 0.5);
      rightEdge -= ctx.measureText(s.price + "*").width + W * 0.015;
    }
    ctx.textAlign = "left";
    const hp = fitText(ctx, h1, rightEdge - x, H * 0.3, 900);
    ctx.font = F(hp, 900); ctx.fillStyle = s.accent;
    ctx.fillText(h1, x, s.dealer ? H * 0.68 : H * 0.5);
    drawCtaButton(ctx, cta, btnCx, H * 0.5, bp, s.accent, "#fff");
  } else {
    // MREC: photo top, text bottom
    const photoH = H * 0.5;
    drawBackground(ctx, W, H, assets, opts && { hint: false }, 0.5, 0.45, 0, 0, W, photoH);
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    let y = photoH + H * 0.05;
    if (s.dealer) {
      const dp = fitText(ctx, s.dealer, W * 0.9, H * 0.05, 700);
      ctx.font = F(dp, 700); ctx.fillStyle = "#fff";
      ctx.fillText(s.dealer, W / 2, y + dp); y += dp * 1.6;
    }
    const hp = fitText(ctx, h1, W * 0.92, H * 0.085, 900);
    ctx.font = F(hp, 900); ctx.fillStyle = s.accent;
    ctx.fillText(h1, W / 2, y + hp); y += hp * 1.35;
    if (s.price) {
      const pp = fitText(ctx, s.price + "* driveaway", W * 0.9, H * 0.06, 800);
      ctx.font = F(pp, 800); ctx.fillStyle = "#fff";
      ctx.fillText(s.price + "* driveaway", W / 2, y + pp); y += pp * 1.3;
    }
    drawCtaButton(ctx, cta, W / 2, H * 0.9, H * 0.05, s.accent, "#fff", W * 0.5);
  }
}

/* 6. Retail stack — photo top, black+red headline, From-price lockup. */
function drawRetail(ctx, W, H, s, assets, opts) {
  const landscape = W / H > 1.4;
  const portrait = H / W > 1.3;
  const U = Math.min(W, H);
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);
  const h1 = tok(s.h1, s), h2 = tok(s.h2, s), tc = tok(s.tc, s), cta = tok(s.cta, s);

  const photoW = landscape ? W * 0.52 : W;
  const photoH = landscape ? H : H * (portrait ? 0.4 : 0.44);
  drawBackground(ctx, W, H, assets, opts, 0.5, 0.35, 0, 0, photoW, photoH);
  drawOverlayImg(ctx, 0, 0, photoW, landscape ? H * 0.85 : photoH + H * 0.04);
  drawDealerMark(ctx, s, assets, W * 0.045, H * 0.055, photoW * 0.9, U * 0.03, "auto");

  const pad = landscape ? photoW + W * 0.045 : W * 0.07;
  const maxW = landscape ? W - pad - W * 0.045 : W - pad * 2;
  let y = landscape ? H * 0.1 : photoH + H * 0.035;

  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  const p1 = fitText(ctx, h1, maxW, U * (landscape ? 0.055 : 0.06), 900);
  ctx.font = F(p1, 900); ctx.fillStyle = "#111";
  y += p1; ctx.fillText(h1, pad, y);

  const p2 = fitText(ctx, h2, maxW, U * (landscape ? 0.095 : 0.105), 900);
  ctx.font = F(p2, 900); ctx.fillStyle = s.accent;
  y += p2 * 1.12; ctx.fillText(h2, pad, y);

  if (s.price) {
    const fp = U * 0.032;
    ctx.font = F(fp, 700); ctx.fillStyle = "#111";
    y += fp * (portrait ? 2.6 : 2.1); ctx.fillText("From", pad, y);
    const pp = fitText(ctx, s.price, maxW * 0.72, U * 0.082, 900);
    ctx.font = F(pp, 900);
    y += pp * 1.02; ctx.fillText(s.price, pad, y);
    const pw = ctx.measureText(s.price).width;
    ctx.font = F(pp * 0.3, 700);
    ctx.fillText("Drive", pad + pw + pp * 0.25, y - pp * 0.42);
    ctx.fillText("away*", pad + pw + pp * 0.25, y - pp * 0.08);
  }

  if (tc) {
    const tp = U * 0.018;
    ctx.font = F(tp, 500); ctx.fillStyle = "#666";
    y += tp * 2.6;
    ctx.fillText(wrapText(ctx, tc, maxW)[0] || "", pad, y);
  }

  const ctaCx = landscape ? pad + maxW / 2 : W / 2;
  const ctaCy = Math.min(
    H * (portrait ? 0.9 : 0.92) - (s.disclaimer ? H * 0.03 : 0),
    y + H * (portrait ? 0.09 : 0.08));
  drawCtaButton(ctx, cta.toUpperCase(), ctaCx, ctaCy, U * 0.03, s.accent, "#fff", maxW * 0.62);
  drawDisclaimer(ctx, s, W, H, "#555", W * 0.04);
}

/* 7. Price roundel — red circle over the photo edge. */
function drawBadgeTpl(ctx, W, H, s, assets, opts) {
  const landscape = W / H > 1.4;
  const portrait = H / W > 1.3;
  const U = Math.min(W, H);
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);
  const h1 = tok(s.h1, s), h2 = tok(s.h2, s), h3 = tok(s.h3, s);
  const sub1 = tok(s.sub1, s), sub2 = tok(s.sub2, s), cta = tok(s.cta, s);

  const photoW = landscape ? W * 0.52 : W;
  const photoH = landscape ? H : H * (portrait ? 0.38 : 0.42);
  drawBackground(ctx, W, H, assets, opts, 0.5, 0.4, 0, 0, photoW, photoH);
  drawOverlayImg(ctx, 0, 0, photoW, landscape ? H * 0.85 : photoH + H * 0.04);
  drawDealerMark(ctx, s, assets, W * 0.045, H * 0.055, photoW * 0.9, U * 0.03, "auto");

  // red roundel straddling the photo edge
  const b1 = tok(s.badge1, s), b2 = tok(s.badge2, s), b3 = tok(s.badge3, s);
  if (b1 || b2 || b3) {
    const r = U * 0.16;
    const bx = landscape ? photoW : W * 0.78;
    const by = landscape ? H * 0.28 : photoH;
    ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2);
    ctx.fillStyle = s.accent; ctx.fill();
    ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const s1 = fitText(ctx, b1, r * 1.5, r * 0.22, 700);
    ctx.font = F(s1, 700); ctx.fillText(b1, bx, by - r * 0.4);
    const s2 = fitText(ctx, b2, r * 1.66, r * 0.4, 900);
    ctx.font = F(s2, 900); ctx.fillText(b2, bx, by);
    const s3 = fitText(ctx, b3, r * 1.5, r * 0.2, 700);
    ctx.font = F(s3, 700); ctx.fillText(b3, bx, by + r * 0.42);
  }

  const pad = landscape ? photoW + W * 0.045 : W * 0.07;
  const maxW = landscape ? W - pad - W * 0.045 : W - pad * 2;
  let y = landscape ? H * 0.48 : photoH + H * 0.05;

  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  const p1 = fitText(ctx, h1, maxW * 0.85, U * 0.052, 800);
  ctx.font = F(p1, 800); ctx.fillStyle = "#111";
  y += p1; ctx.fillText(h1, pad, y);

  const p2 = fitText(ctx, h2, maxW, U * 0.11, 900);
  ctx.font = F(p2, 900); ctx.fillStyle = s.accent;
  y += p2 * 1.1; ctx.fillText(h2, pad, y);

  if (h3) {
    const p3 = fitText(ctx, h3, maxW * 0.7, U * 0.062, 800);
    ctx.font = F(p3, 800); ctx.fillStyle = "#111";
    y += p3 * 1.5; ctx.fillText(h3, pad, y);
  }
  if (sub1) {
    const ps = fitText(ctx, sub1, maxW, U * 0.032, 700);
    ctx.font = F(ps, 700); ctx.fillStyle = "#333";
    y += ps * 2.1; ctx.fillText(sub1, pad, y);
  }
  if (sub2) {
    const ps = fitText(ctx, sub2, maxW, U * 0.028, 500);
    ctx.font = F(ps, 500); ctx.fillStyle = "#333";
    y += ps * 1.6; ctx.fillText(sub2, pad, y);
  }

  const bw = drawCtaButton(ctx, cta + "  ›", pad + maxW * 0.22,
    H * (portrait ? 0.92 : 0.93) - (s.disclaimer ? H * 0.025 : 0),
    U * 0.026, "#3a3a3a", "#fff", maxW * 0.4);
  drawDisclaimer(ctx, s, W, H, "#555", W * 0.04);
}

/* 8. Sale event — date banner over photo, offer + roundel below. */
function drawEvent(ctx, W, H, s, assets, opts) {
  const landscape = W / H > 1.4;
  const portrait = H / W > 1.3;
  const U = Math.min(W, H);
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);
  const h1 = tok(s.h1, s), h2 = tok(s.h2, s), hashtag = tok(s.hashtag, s);
  const offer = tok(s.offer, s), offerLabel = tok(s.offerLabel, s);
  const tc = tok(s.tc, s), cta = tok(s.cta, s);

  const photoW = landscape ? W * 0.5 : W;
  const photoH = landscape ? H : H * (portrait ? 0.36 : 0.4);
  drawBackground(ctx, W, H, assets, opts, 0.5, 0.5, 0, 0, photoW, photoH);
  drawOverlayImg(ctx, 0, 0, photoW, landscape ? H * 0.85 : photoH + H * 0.04);

  // white date card with red header
  const month = tok(s.month, s);
  const dates = tok(s.dates, s).split(",").map((t) => t.trim()).filter(Boolean);
  if (month || dates.length) {
    const cw = Math.min(photoW * 0.84, U * 0.86);
    const cx0 = (photoW - cw) / 2;
    const cy0 = landscape ? H * 0.14 : H * 0.1;
    const hh = U * 0.05, bodyH = U * 0.115;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.28)"; ctx.shadowBlur = U * 0.02;
    ctx.fillStyle = "#fff";
    ctx.fillRect(cx0, cy0, cw, hh + bodyH);
    ctx.restore();
    ctx.fillStyle = s.accent;
    ctx.fillRect(cx0, cy0, cw, hh);
    ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = F(hh * 0.55, 800);
    ctx.fillText(month, cx0 + cw / 2, cy0 + hh / 2 + hh * 0.03);
    if (dates.length) {
      const colW = cw / dates.length;
      dates.forEach((d, i) => {
        const parts = d.split(/\s+/);
        const num = parts[0] || "", label = parts.slice(1).join(" ");
        const cxCol = cx0 + colW * i + colW / 2;
        const numPx = fitText(ctx, num, colW * 0.7, bodyH * 0.5, 900);
        ctx.font = F(numPx, 900); ctx.fillStyle = "#111";
        ctx.fillText(num, cxCol, cy0 + hh + bodyH * 0.42);
        if (label) {
          ctx.font = F(bodyH * 0.16, 700); ctx.fillStyle = "#555";
          ctx.fillText(label.toUpperCase(), cxCol, cy0 + hh + bodyH * 0.78);
        }
        if (i > 0) {
          ctx.strokeStyle = "#ddd"; ctx.lineWidth = Math.max(1, U * 0.002);
          ctx.beginPath();
          ctx.moveTo(cx0 + colW * i, cy0 + hh + bodyH * 0.15);
          ctx.lineTo(cx0 + colW * i, cy0 + hh + bodyH * 0.85);
          ctx.stroke();
        }
      });
    }
  }

  const pad = landscape ? photoW + W * 0.045 : W * 0.07;
  const maxW = landscape ? W - pad - W * 0.045 : W - pad * 2;
  let y = landscape ? H * 0.14 : photoH + H * 0.05;

  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  const p1 = fitText(ctx, h1, maxW * 0.8, U * 0.068, 900);
  ctx.font = F(p1, 900); ctx.fillStyle = "#111";
  y += p1; ctx.fillText(h1, pad, y);

  const p2 = fitText(ctx, h2, maxW * 0.8, U * 0.085, 900);
  ctx.font = F(p2, 900); ctx.fillStyle = s.accent;
  y += p2 * 1.15; ctx.fillText(h2, pad, y);

  if (offer) {
    const po = fitText(ctx, offer, maxW * 0.62, U * 0.095, 900);
    ctx.font = F(po, 900); ctx.fillStyle = "#111";
    y += po * 1.35; ctx.fillText(offer, pad, y);
    if (offerLabel) {
      const pl = fitText(ctx, offerLabel, maxW * 0.6, U * 0.035, 600);
      ctx.font = F(pl, 600);
      y += pl * 1.7; ctx.fillText(offerLabel, pad, y);
    }
  }

  // red roundel to the right of the offer
  const b1 = tok(s.badge1, s), b2 = tok(s.badge2, s);
  if (b1 || b2) {
    const r = U * 0.115;
    const bx = pad + maxW - r * 1.05;
    const by = landscape ? H * 0.62 : photoH + (H - photoH) * 0.42;
    ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2);
    ctx.fillStyle = s.accent; ctx.fill();
    ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const s1 = fitText(ctx, b1, r * 1.6, r * 0.34, 900);
    ctx.font = F(s1, 900); ctx.fillText(b1, bx, by - r * 0.18);
    const s2 = fitText(ctx, b2, r * 1.6, r * 0.34, 900);
    ctx.font = F(s2, 900); ctx.fillText(b2, bx, by + r * 0.2);
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  }

  if (hashtag) {
    const ph = fitText(ctx, hashtag, maxW * 0.7, U * 0.03, 700);
    ctx.font = F(ph, 700); ctx.fillStyle = "#111";
    y += ph * 2.4; ctx.fillText(hashtag, pad, y);
  }
  if (tc) {
    const tp = U * 0.017;
    ctx.font = F(tp, 500); ctx.fillStyle = "#666";
    let ty = y + tp * 2.4;
    for (const ln of wrapText(ctx, tc, maxW * 0.75).slice(0, 2)) {
      ctx.fillText(ln, pad, ty); ty += tp * 1.35;
    }
  }
  drawDealerMark(ctx, s, assets, W * 0.045, H * 0.05,
    (landscape ? photoW : W) * 0.9, U * 0.028, "auto");
  drawDisclaimer(ctx, s, W, H, "#555", W * 0.04);
}

/* 9. Full-photo hero — centred stack with an accent word. */
function drawHero(ctx, W, H, s, assets, opts) {
  const U = Math.min(W, H);
  drawBackground(ctx, W, H, assets, opts, 0.5, 0.55);

  // legibility gradients top and bottom
  let g = ctx.createLinearGradient(0, 0, 0, H * 0.55);
  g.addColorStop(0, "rgba(6,14,30,0.72)"); g.addColorStop(1, "rgba(6,14,30,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H * 0.55);
  g = ctx.createLinearGradient(0, H * 0.65, 0, H);
  g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,0.6)");
  ctx.fillStyle = g; ctx.fillRect(0, H * 0.65, W, H * 0.35);
  drawOverlayImg(ctx, 0, H * 0.32, W, H * 0.42);

  drawDealerMark(ctx, s, assets, W * 0.045, H * 0.055, W * 0.9, U * 0.03, "auto");

  const h1 = tok(s.h1, s), h2 = tok(s.h2, s), h2b = tok(s.h2accent, s);
  const h3 = tok(s.h3, s), sub1 = tok(s.sub1, s);
  const foot1 = tok(s.foot1, s), foot2 = tok(s.foot2, s), cta = tok(s.cta, s);

  ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
  let y = H * 0.16;
  if (h1) {
    const p1 = fitText(ctx, h1, W * 0.8, U * 0.055, 700);
    ctx.font = F(p1, 700); ctx.fillStyle = "#fff";
    y += p1; ctx.fillText(h1, W / 2, y);
  }
  if (h2 || h2b) {
    const joined = (h2 + " " + h2b).trim();
    const p2 = fitText(ctx, joined, W * 0.86, U * 0.085, 900);
    ctx.font = F(p2, 900);
    y += p2 * 1.15;
    const wA = h2 ? ctx.measureText(h2 + " ").width : 0;
    const total = ctx.measureText(joined).width;
    let x0 = W / 2 - total / 2;
    ctx.textAlign = "left";
    if (h2) { ctx.fillStyle = "#fff"; ctx.fillText(h2 + " ", x0, y); }
    if (h2b) { ctx.fillStyle = s.accent; ctx.fillText(h2b, x0 + wA, y); }
    ctx.textAlign = "center";
  }
  if (h3) {
    const p3 = fitText(ctx, h3, W * 0.88, U * 0.1, 900);
    ctx.font = F(p3, 900); ctx.fillStyle = "#fff";
    y += p3 * 1.15; ctx.fillText(h3, W / 2, y);
  }
  if (sub1) {
    const ps = fitText(ctx, sub1, W * 0.82, U * 0.032, 500);
    ctx.font = F(ps, 500); ctx.fillStyle = "rgba(255,255,255,0.92)";
    y += ps * 2.2; ctx.fillText(sub1, W / 2, y);
  }

  let fy = H * (s.disclaimer ? 0.76 : 0.78);
  if (foot1) {
    const pf = fitText(ctx, foot1, W * 0.8, U * 0.06, 900);
    ctx.font = F(pf, 900); ctx.fillStyle = "#fff";
    ctx.fillText(foot1, W / 2, fy);
    fy += pf * 0.72;
  }
  if (foot2) {
    const pf2 = fitText(ctx, foot2, W * 0.7, U * 0.032, 500);
    ctx.font = F(pf2, 500); ctx.fillStyle = "rgba(255,255,255,0.95)";
    fy += pf2 * 1.1; ctx.fillText(foot2, W / 2, fy);
  }
  if (cta) {
    drawCtaButton(ctx, cta, W / 2, H * 0.9 - (s.disclaimer ? H * 0.025 : 0),
      U * 0.028, "#f4f4f4", "#111", W * 0.3);
  }
  drawDisclaimer(ctx, s, W, H, "#fff", W * 0.04);
}

/* 10. Velocity slash — layered diagonal wedges over a full photo. */
function drawVelocity(ctx, W, H, s, assets, opts) {
  const U = Math.min(W, H);
  const portrait = H / W > 1.3, landscape = W / H > 1.4;
  drawBackground(ctx, W, H, assets, opts, 0.5, 0.4);
  drawOverlayImg(ctx, 0, H * 0.14, W, H * (portrait ? 0.5 : 0.46));

  // diagonal geometry: left edge higher, dropping to the right
  const drop = W * (landscape ? 0.07 : 0.11);
  const t1 = H * (portrait ? 0.68 : landscape ? 0.56 : 0.62);

  // floating accent stripe above the wedge
  const g0 = U * 0.022, th = U * 0.035;
  ctx.beginPath();
  ctx.moveTo(0, t1 - g0 - th);
  ctx.lineTo(W, t1 + drop - g0 - th);
  ctx.lineTo(W, t1 + drop - g0);
  ctx.lineTo(0, t1 - g0);
  ctx.closePath();
  ctx.fillStyle = s.accent; ctx.fill();

  // charcoal wedge carrying the copy
  ctx.beginPath();
  ctx.moveTo(0, t1);
  ctx.lineTo(W, t1 + drop);
  ctx.lineTo(W, H);
  ctx.lineTo(0, H);
  ctx.closePath();
  ctx.fillStyle = "rgba(16,16,18,0.96)"; ctx.fill();

  drawDealerMark(ctx, s, assets, W * 0.045, H * 0.055, W * 0.9, U * 0.03, "auto");

  const pad = W * 0.06;
  const kicker = tok(s.kicker, s), h1 = tok(s.h1, s), h2 = tok(s.h2, s), cta = tok(s.cta, s);
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  let y = t1 + U * 0.085;
  if (kicker) {
    const pk = fitText(ctx, kicker, W * 0.6, U * 0.028, 700);
    ctx.font = F(pk, 700); ctx.fillStyle = s.accent;
    ctx.fillText(kicker.toUpperCase(), pad, y);
    y += pk * 0.6;
  }
  const p1 = fitText(ctx, h1, W * 0.88, U * 0.075, 900);
  ctx.font = F(p1, 900); ctx.fillStyle = "#fff";
  y += p1 * 1.2; ctx.fillText(h1, pad, y);
  if (h2) {
    const p2 = fitText(ctx, h2, W * 0.7, U * 0.045, 900);
    ctx.font = F(p2, 900); ctx.fillStyle = s.accent;
    y += p2 * 1.6; ctx.fillText(h2, pad, y);
  }
  if (s.price) {
    const pp = fitText(ctx, s.price + "*", W * 0.3, U * 0.055, 900);
    ctx.font = F(pp, 900); ctx.fillStyle = "#fff"; ctx.textAlign = "right";
    ctx.fillText(s.price + "*", W - pad, t1 + drop * 0.8 + U * 0.1);
    ctx.font = F(pp * 0.34, 600);
    ctx.fillText("driveaway", W - pad, t1 + drop * 0.8 + U * 0.1 + pp * 0.5);
    ctx.textAlign = "left";
  }
  drawCtaButton(ctx, cta, W - pad - U * 0.13, H - U * (s.disclaimer ? 0.1 : 0.065),
    U * 0.026, s.accent, "#fff", U * 0.24);
  drawDisclaimer(ctx, s, W, H, "#bbb", pad * 0.7);
}

/* 11. Poster type — oversized model name cropped off the edges. */
function drawPoster(ctx, W, H, s, assets, opts) {
  const U = Math.min(W, H);
  if (assets.bg) drawBackground(ctx, W, H, assets, opts && { hint: false });
  else { ctx.fillStyle = BRAND.webGrey; ctx.fillRect(0, 0, W, H); }

  const giant = (tok(s.giant, s) || "").toUpperCase();
  const kicker = tok(s.kicker, s), bar = tok(s.bar, s), cta = tok(s.cta, s);
  const barH = H * 0.115;

  // giant display word, deliberately wider than the canvas
  if (giant) {
    ctx.font = F(100, 900);
    const w100 = ctx.measureText(giant).width || 1;
    const px = Math.min((W * 1.18 / w100) * 100, H * 0.44);
    ctx.font = F(px, 900);
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    ctx.fillStyle = assets.bg ? "rgba(255,255,255,0.85)" : BRAND.steel;
    ctx.fillText(giant, W / 2, H * 0.42);
  }

  drawOverlayImg(ctx, W * 0.04, H * 0.16, W * 0.92, H * 0.66 - barH / 2);

  if (kicker) {
    const pk = fitText(ctx, kicker, W * 0.5, U * 0.034, 800);
    ctx.font = F(pk, 800); ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    ctx.fillStyle = assets.bg ? "#fff" : "#111";
    ctx.fillText(kicker.toUpperCase(), W * 0.055, H * 0.09);
    ctx.fillStyle = s.accent;
    ctx.fillRect(W * 0.055, H * 0.09 + pk * 0.5, pk * 2.4, pk * 0.16);
  }
  drawDealerMark(ctx, s, assets, W * 0.5, H * 0.075, W * 0.45,
    U * 0.028, assets.bg ? "#fff" : "#111", "right");

  // offer bar
  const barY = H - barH;
  ctx.fillStyle = s.accent; ctx.fillRect(0, barY, W, barH);
  ctx.textBaseline = "middle"; ctx.textAlign = "left";
  let ctaW = 0;
  if (cta) {
    let bp = barH * 0.22;
    ctx.font = F(bp, 700);
    ctaW = ctx.measureText(cta.toUpperCase()).width + bp * 2.4;
    if (ctaW > W * 0.5) { // long CTA on a narrow canvas: shrink to fit
      bp *= (W * 0.5) / ctaW; ctaW = W * 0.5;
    }
    drawCtaButton(ctx, cta.toUpperCase(), W - W * 0.045 - ctaW / 2,
      barY + barH / 2, bp, "#fff", "#111");
  }
  if (bar) {
    const pb = fitText(ctx, bar, W - ctaW - W * 0.16, barH * 0.34, 800);
    ctx.font = F(pb, 800); ctx.fillStyle = "#fff"; ctx.textAlign = "left";
    ctx.fillText(bar.toUpperCase(), W * 0.055, barY + barH / 2 + pb * 0.05);
  }
  ctx.textBaseline = "alphabetic";
  // small print sits just above the bar
  if (s.disclaimer) {
    const tp = Math.max(9, U * 0.016);
    ctx.font = F(tp, 500);
    ctx.fillStyle = assets.bg ? "rgba(255,255,255,0.85)" : "#666";
    ctx.textAlign = "left";
    const lines = wrapText(ctx, s.disclaimer, W * 0.9);
    let ty = barY - tp * 0.9 - (lines.length - 1) * tp * 1.3;
    for (const ln of lines) { ctx.fillText(ln, W * 0.055, ty); ty += tp * 1.3; }
  }
}

/* 12. Spotlight — model name in giant type BEHIND the vehicle cutout. */
function drawSpotlight(ctx, W, H, s, assets, opts) {
  const U = Math.min(W, H);
  // dark stage
  ctx.fillStyle = "#121214"; ctx.fillRect(0, 0, W, H);
  if (assets.bg) {
    drawCover(ctx, assets.bg, 0, 0, W, H, 0.5, 0.5);
    ctx.fillStyle = "rgba(10,10,12,0.78)"; ctx.fillRect(0, 0, W, H);
  }
  // accent glow + white core
  let g = ctx.createRadialGradient(W / 2, H * 0.44, 0, W / 2, H * 0.44, U * 0.75);
  g.addColorStop(0, hexToRgba(s.accent, 0.42));
  g.addColorStop(0.55, hexToRgba(s.accent, 0.12));
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  g = ctx.createRadialGradient(W / 2, H * 0.42, 0, W / 2, H * 0.42, U * 0.35);
  g.addColorStop(0, "rgba(255,255,255,0.14)"); g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  drawDealerMark(ctx, s, assets, W * 0.045, H * 0.055, W * 0.9, U * 0.028, "auto");

  const kicker = tok(s.kicker, s), giant = (tok(s.giant, s) || "").toUpperCase();
  const sub1 = tok(s.sub1, s), cta = tok(s.cta, s);
  ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";

  if (kicker) {
    const pk = fitText(ctx, kicker, W * 0.7, U * 0.03, 700);
    ctx.font = F(pk, 700); ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText(kicker.toUpperCase(), W / 2, H * 0.16);
  }
  if (giant) {
    const pg = fitText(ctx, giant, W * 0.94, H * 0.24, 900);
    ctx.font = F(pg, 900); ctx.fillStyle = "#fff";
    ctx.fillText(giant, W / 2, H * 0.52);
  }
  // floor shadow, then the cutout over the letters
  const ovRegion = { x: W * 0.06, y: H * 0.3, w: W * 0.88, h: H * 0.46 };
  if (CUR_ASSETS.overlay) {
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.beginPath();
    ctx.ellipse(W / 2, ovRegion.y + ovRegion.h, W * 0.32 * (s.ovScale || 0.9),
      U * 0.03, 0, 0, Math.PI * 2);
    ctx.filter = `blur(${Math.max(2, U * 0.012)}px)`;
    ctx.fill();
    ctx.restore();
  }
  drawOverlayImg(ctx, ovRegion.x, ovRegion.y, ovRegion.w, ovRegion.h);

  if (sub1) {
    const ps = fitText(ctx, sub1, W * 0.84, U * 0.03, 700);
    ctx.font = F(ps, 700); ctx.fillStyle = "#fff";
    ctx.fillText(sub1.toUpperCase(), W / 2, H * 0.84);
  }
  let ctaY = H * 0.915 - (s.disclaimer ? H * 0.02 : 0);
  if (s.price) {
    const pp = fitText(ctx, s.price + "* driveaway", W * 0.5, U * 0.032, 800);
    ctx.font = F(pp, 800); ctx.fillStyle = "#fff"; ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(s.price + "* driveaway", W / 2 - U * 0.02, ctaY);
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    drawCtaButton(ctx, cta, W / 2 + U * 0.14, ctaY, U * 0.026, s.accent, "#fff");
  } else if (cta) {
    drawCtaButton(ctx, cta, W / 2, ctaY, U * 0.028, s.accent, "#fff", W * 0.3);
  }
  drawDisclaimer(ctx, s, W, H, "rgba(255,255,255,0.8)", W * 0.04);
}

function hexToRgba(hex, a) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return `rgba(235,10,30,${a})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/* OWAF "OH WHAT A FEELING" tagline lock-up.
   Per masterbrand rules it must be placed as the official logo file
   (uploaded in the app), never typed out — so this only draws when the
   asset is present. Auto placement avoids each template's busy corner. */
const OWAF_AUTO_POS = {
  arrival: "bottom-left", clearance: "bottom-right",
  driveaway: "bottom-right", announce: "top-right", promo: "top-right",
  retail: "top-right", badge: "top-right", event: "bottom-right",
  hero: "bottom-left", velocity: "top-right", poster: "top-left",
  spotlight: "bottom-right",
};

function drawOwaf(ctx, W, H, templateId, s, assets) {
  let img = assets.owaf; // custom upload always wins
  let variant = null;
  if (!img) {
    variant = !s.owafVariant || s.owafVariant === "auto" ? "auto" : s.owafVariant;
    if (variant === "off") return;
  }
  let pos = s.owafPos && s.owafPos !== "auto" ? s.owafPos : OWAF_AUTO_POS[templateId] || "bottom-right";
  // portrait arrival: bottom is the text panel, keep the tagline on the photo
  if (templateId === "arrival" && H / W > 1.3 && (!s.owafPos || s.owafPos === "auto")) pos = "top-right";

  const mx = W * 0.045;
  const myTop = H * 0.045, myBot = H * 0.045 + (s.disclaimer ? H * 0.035 : 0);
  const place = (im) => {
    const wide = im.width / im.height > 5; // single-line lock-up
    const w = wide ? Math.min(W * 0.34, 640) : Math.min(W * 0.2, 400);
    const h = w * (im.height / im.width);
    return {
      w, h,
      x: pos.endsWith("left") ? mx : W - mx - w,
      y: pos.startsWith("top") ? myTop : H - myBot - h,
    };
  };
  if (!img) {
    if (variant === "auto") {
      // pick a variant that stays legible over what's actually behind it
      const probe = assets.owafPack && (assets.owafPack.white || assets.owafPack.red);
      if (!probe) return;
      const r0 = place(probe);
      variant = luminanceAt(ctx, r0.x, r0.y, r0.w, r0.h) > 0.6 ? "red" : "white";
    }
    img = assets.owafPack && assets.owafPack[variant];
  }
  if (!img) return;
  const r = place(img);
  putImage(ctx, "owaf", img, r.x, r.y, r.w, r.h);
}

const TEMPLATE_RENDERERS = {
  arrival: drawArrival,
  clearance: drawClearance,
  driveaway: drawDriveaway,
  announce: drawAnnounce,
  promo: drawPromo,
  retail: drawRetail,
  badge: drawBadgeTpl,
  event: drawEvent,
  hero: drawHero,
  velocity: drawVelocity,
  poster: drawPoster,
  spotlight: drawSpotlight,
};

function renderAd(canvas, size, templateId, state, assets, opts = {}) {
  canvas.width = size.w;
  canvas.height = size.h;
  const ctx = canvas.getContext("2d");
  CUR = state; CUR_ASSETS = assets;

  // Intercept fillText once per context: applies NUDGE offsets to known
  // fields, records layers when REC is set, respects SUPPRESS.text.
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
  if (Math.min(size.w, size.h) <= 300) {
    drawMicro(ctx, size.w, size.h, state, assets, opts);
  } else {
    (TEMPLATE_RENDERERS[templateId] || drawArrival)(ctx, size.w, size.h, state, assets, opts);
    drawOwaf(ctx, size.w, size.h, templateId, state, assets);
  }
}

/* Render once while recording every text/image/CTA element. */
function renderAdLayers(size, templateId, state, assets) {
  const c = document.createElement("canvas");
  REC = [];
  renderAd(c, size, templateId, state, assets, { hint: false });
  const layers = REC;
  REC = null;
  return layers;
}

/* Render the flattened background only: photo, panels, washes, shapes —
   no text, CTA, logos, OWAF, or vehicle overlay. */
function renderAdBackground(size, templateId, state, assets) {
  const c = document.createElement("canvas");
  SUPPRESS = { text: 1, cta: 1, logo: 1, owaf: 1, overlay: 1 };
  renderAd(c, size, templateId, state, assets, { hint: false });
  SUPPRESS = null;
  return c;
}
