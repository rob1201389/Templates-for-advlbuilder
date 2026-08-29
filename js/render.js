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
}

/* Dealer identity block: logo image (if any) + dealer name. */
function drawDealerMark(ctx, s, assets, x, y, maxW, px, colour, align = "left") {
  ctx.save();
  ctx.textBaseline = "middle";
  let cursor = x;
  const logoH = px * 1.9;
  if (assets.logo) {
    const lw = assets.logo.width * (logoH / assets.logo.height);
    if (align === "left") {
      ctx.drawImage(assets.logo, cursor, y - logoH / 2, lw, logoH);
      cursor += lw + px * 0.6;
    } else {
      // right aligned: name then logo from the right edge
      ctx.font = F(px, 700);
      const nameW = s.dealer ? ctx.measureText(s.dealer).width : 0;
      const total = lw + (nameW ? px * 0.6 + nameW : 0);
      let lx = x + maxW - total;
      ctx.drawImage(assets.logo, lx, y - logoH / 2, lw, logoH);
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
  ctx.font = F(px, 700);
  const tw = ctx.measureText(text).width;
  const w = Math.max(minW, tw + px * 2.4);
  const h = px * 2.2;
  roundRectPath(ctx, cx - w / 2, cy - h / 2, w, h, h / 2);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, cx, cy + px * 0.06);
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/* ================= TEMPLATES ================= */

/* 1. Stock arrival — photo + big dark circular panel. */
function drawArrival(ctx, W, H, s, assets, opts) {
  const portrait = H / W > 1.3;
  drawBackground(ctx, W, H, assets, opts, portrait ? 0.5 : 0.3, 0.5);

  if (!portrait) {
    // Dark circle panel on the right
    const cx = W * 0.74, cy = H * 0.5, r = Math.max(W * 0.42, H * 0.78);
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(8,8,10,0.94)"; ctx.fill();
    ctx.restore();

    const tx = Math.max(W * 0.62, W - r * 0.9);
    const colW = W - tx - W * 0.05;
    const cxT = tx + colW / 2;

    drawDealerMark(ctx, s, assets, tx, H * 0.12, colW, Math.min(W, H) * 0.032, "#fff");

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

    const cxT = W / 2, colW = W * 0.86;
    drawDealerMark(ctx, s, assets, W * 0.07, H * 0.06, W * 0.86, W * 0.035, "#fff");

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

  const pad = W * 0.07;
  drawDealerMark(ctx, s, assets, pad, H * 0.08, W - pad * 2, Math.min(W, H) * 0.032, "#fff");

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
    drawDealerMark(ctx, s, assets, W * 0.05, H * 0.05, W * 0.9, Math.min(W, H) * 0.03, "#fff");

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
    drawDealerMark(ctx, s, assets, W * 0.03, H * 0.09, photoW * 0.9, Math.min(W, H) * 0.045, "#fff");

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
  if (assets.bg) drawContain(ctx, assets.bg, W * 0.05, bandY, W * 0.9, bandH);
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

  const h1 = (tok(s.h1, s) + " " + tok(s.h2, s)).trim() || "NEW STOCK HAS LANDED";
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

/* OWAF "OH WHAT A FEELING" tagline lock-up.
   Per masterbrand rules it must be placed as the official logo file
   (uploaded in the app), never typed out — so this only draws when the
   asset is present. Auto placement avoids each template's busy corner. */
const OWAF_AUTO_POS = {
  arrival: "bottom-left", clearance: "bottom-right",
  driveaway: "bottom-right", announce: "top-right", promo: "top-right",
};

function drawOwaf(ctx, W, H, templateId, s, assets) {
  const img = assets.owaf;
  if (!img) return;
  let pos = s.owafPos && s.owafPos !== "auto" ? s.owafPos : OWAF_AUTO_POS[templateId] || "bottom-right";
  // portrait arrival: bottom is the text panel, keep the tagline on the photo
  if (templateId === "arrival" && H / W > 1.3 && (!s.owafPos || s.owafPos === "auto")) pos = "top-right";

  const w = Math.min(W * 0.24, 460);
  const h = w * (img.height / img.width);
  const mx = W * 0.045;
  const myTop = H * 0.045, myBot = H * 0.045 + (s.disclaimer ? H * 0.035 : 0);
  const x = pos.endsWith("left") ? mx : W - mx - w;
  const y = pos.startsWith("top") ? myTop : H - myBot - h;
  ctx.drawImage(img, x, y, w, h);
}

const TEMPLATE_RENDERERS = {
  arrival: drawArrival,
  clearance: drawClearance,
  driveaway: drawDriveaway,
  announce: drawAnnounce,
  promo: drawPromo,
};

function renderAd(canvas, size, templateId, state, assets, opts = {}) {
  canvas.width = size.w;
  canvas.height = size.h;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, size.w, size.h);
  if (Math.min(size.w, size.h) <= 300) {
    drawMicro(ctx, size.w, size.h, state, assets, opts);
  } else {
    (TEMPLATE_RENDERERS[templateId] || drawArrival)(ctx, size.w, size.h, state, assets, opts);
    drawOwaf(ctx, size.w, size.h, templateId, state, assets);
  }
}
