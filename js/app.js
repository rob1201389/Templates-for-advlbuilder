/* ============================================================
   App wiring: form, custom lists, uploads, previews, export.
   ============================================================ */

const CUSTOM_KEY = "adbuilder_custom_lists";

function loadCustom() {
  try {
    return Object.assign({ models: [], grades: {}, colours: [], dealers: [] },
      JSON.parse(localStorage.getItem(CUSTOM_KEY)) || {});
  } catch { return { models: [], grades: {}, colours: [], dealers: [] }; }
}
function saveCustom(c) { localStorage.setItem(CUSTOM_KEY, JSON.stringify(c)); }

const assets = {
  bg: null, logo: null, owaf: null, overlay: null,
  vehicles: [null, null, null],     // processed (white removed) images
  vehiclesRaw: [null, null, null],  // originals as uploaded,
  logoPack: null,   // built-in dealer lockup for the selected dealership
  owafPack: {},     // built-in OWAF tagline variants
};

/* Make near-white studio backgrounds transparent so cutouts sit
   cleanly on any backdrop; soft shadows are feathered, not cut. */
function stripWhite(img) {
  const c = document.createElement("canvas");
  c.width = img.naturalWidth || img.width;
  c.height = img.naturalHeight || img.height;
  const x = c.getContext("2d");
  x.drawImage(img, 0, 0);
  try {
    const d = x.getImageData(0, 0, c.width, c.height);
    const p = d.data;
    for (let i = 0; i < p.length; i += 4) {
      const mn = Math.min(p[i], p[i + 1], p[i + 2]);
      if (mn > 247) p[i + 3] = 0;
      else if (mn > 230) p[i + 3] = Math.round(p[i + 3] * ((247 - mn) / 17));
    }
    x.putImageData(d, 0, 0);
  } catch {}
  return c;
}

/* Crop away transparent margins so the vehicle fills its slot. */
function trimAlpha(source) {
  const c = document.createElement("canvas");
  c.width = source.naturalWidth || source.width;
  c.height = source.naturalHeight || source.height;
  const x = c.getContext("2d");
  x.drawImage(source, 0, 0);
  try {
    const d = x.getImageData(0, 0, c.width, c.height).data;
    let minX = c.width, minY = c.height, maxX = -1, maxY = -1, opaque = 0;
    for (let yy = 0; yy < c.height; yy += 2) {
      for (let xx = 0; xx < c.width; xx += 2) {
        const a = d[(yy * c.width + xx) * 4 + 3];
        if (a > 12) {
          opaque++;
          if (xx < minX) minX = xx;
          if (xx > maxX) maxX = xx;
          if (yy < minY) minY = yy;
          if (yy > maxY) maxY = yy;
        }
      }
    }
    // no transparency (e.g. a JPG) or nothing found: keep as-is
    if (maxX < 0 || opaque * 4 > c.width * c.height * 0.96) return c;
    const pad = Math.round(Math.max(c.width, c.height) * 0.01);
    minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
    maxX = Math.min(c.width - 1, maxX + pad); maxY = Math.min(c.height - 1, maxY + pad);
    const out = document.createElement("canvas");
    out.width = maxX - minX + 1; out.height = maxY - minY + 1;
    out.getContext("2d").drawImage(c, -minX, -minY);
    return out;
  } catch { return c; }
}

function processVehicles() {
  const strip = $("f-strip-white").checked;
  for (let i = 0; i < 3; i++) {
    const raw = assets.vehiclesRaw[i];
    assets.vehicles[i] = raw ? trimAlpha(strip ? stripWhite(raw) : raw) : null;
  }
  scheduleRender();
}

function loadImage(src, cb) {
  const img = new Image();
  img.onload = () => cb(img);
  img.src = src;
}

const dealerLogoCache = {};
function loadDealerLogos() {
  const dealer = pickDealer();
  const spec = DEALER_LOGOS[dealer];
  if (!spec) { assets.logoPack = null; scheduleRender(); return; }
  if (dealerLogoCache[dealer]) {
    assets.logoPack = dealerLogoCache[dealer]; scheduleRender(); return;
  }
  loadImage(spec.h, (img) => {
    dealerLogoCache[dealer] = { h: img };
    assets.logoPack = dealerLogoCache[dealer];
    scheduleRender();
  });
}

function loadOwafPack() {
  for (const [variant, src] of Object.entries(OWAF_FILES)) {
    loadImage(src, (img) => { assets.owafPack[variant] = img; scheduleRender(); });
  }
  loadImage(TOYOTA_LOGO_FILE, (img) => { assets.toyotaLogo = img; scheduleRender(); });
}
const OTHER = "__other__";

const $ = (id) => document.getElementById(id);

/* ---------- state ---------- */
function readState() {
  const templateId = document.querySelector("input[name=template]:checked").value;
  const pick = (selId, otherId) => {
    const sel = $(selId);
    return sel.value === OTHER ? $(otherId).value.trim() : sel.value;
  };
  const s = {
    templateId,
    dealer: pickDealer(),
    model: pick("f-model", "f-model-other"),
    grade: pick("f-grade", "f-grade-other"),
    colour: pick("f-colour", "f-colour-other"),
    price: $("f-price").value.trim(),
    disclaimer: $("f-disclaimer").value.trim(),
    dealerDetails: $("f-dealer-details").value.trim(),
    accent: $("f-accent").value || "#EB0A1E",
    branding: $("f-branding").value,
    logoAlign: $("f-logo-align").value,
    ctaStyle: $("f-cta-style").value,
    owafVariant: $("f-owaf-variant").value,
    scrimMode: $("f-scrim-mode").value,
    scrim: (+$("f-scrim").value || 0) / 100,
    vehScale1: (+$("f-veh1-scale").value || 100) / 100,
    vehScale2: (+$("f-veh2-scale").value || 100) / 100,
    vehScale3: (+$("f-veh3-scale").value || 100) / 100,
  };
  document.querySelectorAll("#dyn-fields [data-key]").forEach((el) => {
    s[el.dataset.key] = el.value;
  });
  return s;
}

/* ---------- selects with "Other…" ---------- */
function fillSelect(sel, values, keep) {
  const prev = keep ? sel.value : null;
  sel.innerHTML = "";
  for (const v of values) {
    const o = document.createElement("option");
    o.value = v; o.textContent = v;
    sel.appendChild(o);
  }
  const other = document.createElement("option");
  other.value = OTHER; other.textContent = "Other…";
  sel.appendChild(other);
  if (prev && [...sel.options].some((o) => o.value === prev)) sel.value = prev;
}

function allModels() {
  const c = loadCustom();
  return TOYOTA_MODELS.map((m) => m.name).concat(c.models);
}
function gradesFor(model) {
  const c = loadCustom();
  const base = TOYOTA_MODELS.find((m) => m.name === model)?.grades || [];
  return base.concat(c.grades[model] || []);
}
function allColours() {
  return TOYOTA_COLOURS.concat(loadCustom().colours);
}
function allDealers() {
  return DEALERSHIPS.concat(loadCustom().dealers);
}
function pickDealer() {
  const sel = $("f-dealer");
  return sel.value === OTHER ? $("f-dealer-other").value.trim() : sel.value;
}

function wireOther(selId, otherWrapId) {
  $(selId).addEventListener("change", () => {
    $(otherWrapId).hidden = $(selId).value !== OTHER;
    if (selId === "f-model") refreshGrades();
    if (selId === "f-dealer") loadDealerLogos();
    scheduleRender();
  });
}

function refreshGrades() {
  const model = $("f-model").value === OTHER ? $("f-model-other").value.trim() : $("f-model").value;
  const sel = $("f-grade");
  fillSelect(sel, gradesFor(model), true);
  // don't stay stuck on an empty "Other…" after a model change
  if (sel.value === OTHER && !$("f-grade-other").value.trim() && sel.options.length > 1) {
    sel.selectedIndex = 0;
  }
  $("f-grade-other-wrap").hidden = sel.value !== OTHER;
}

/* "save to my list" buttons */
function wireSaveButtons() {
  $("save-dealer").addEventListener("click", () => {
    const v = $("f-dealer-other").value.trim();
    if (!v) return;
    const c = loadCustom();
    if (!c.dealers.includes(v) && !DEALERSHIPS.includes(v)) c.dealers.push(v);
    saveCustom(c);
    fillSelect($("f-dealer"), allDealers(), false);
    $("f-dealer").value = v;
    $("f-dealer-other-wrap").hidden = true;
    loadDealerLogos();
    scheduleRender();
  });
  $("save-model").addEventListener("click", () => {
    const v = $("f-model-other").value.trim();
    if (!v) return;
    const c = loadCustom();
    if (!c.models.includes(v) && !TOYOTA_MODELS.some((m) => m.name === v)) c.models.push(v);
    saveCustom(c);
    fillSelect($("f-model"), allModels(), false);
    $("f-model").value = v;
    $("f-model-other-wrap").hidden = true;
    refreshGrades();
    scheduleRender();
  });
  $("save-grade").addEventListener("click", () => {
    const v = $("f-grade-other").value.trim();
    const model = $("f-model").value === OTHER ? $("f-model-other").value.trim() : $("f-model").value;
    if (!v || !model) return;
    const c = loadCustom();
    c.grades[model] = c.grades[model] || [];
    if (!c.grades[model].includes(v)) c.grades[model].push(v);
    saveCustom(c);
    refreshGrades();
    $("f-grade").value = v;
    $("f-grade-other-wrap").hidden = true;
    scheduleRender();
  });
  $("save-colour").addEventListener("click", () => {
    const v = $("f-colour-other").value.trim();
    if (!v) return;
    const c = loadCustom();
    if (!c.colours.includes(v) && !TOYOTA_COLOURS.includes(v)) c.colours.push(v);
    saveCustom(c);
    fillSelect($("f-colour"), allColours(), false);
    $("f-colour").value = v;
    $("f-colour-other-wrap").hidden = true;
    scheduleRender();
  });
}

/* ---------- templates ---------- */
const FIELD_LABELS = {
  h1: "Headline line 1", h2: "Headline line 2", h3: "Headline line 3",
  h2accent: "Accent word (headline line 2)",
  sub1: "Sub-line 1", sub2: "Sub-line 2", pill: "Pill text",
  tagline: "Tagline", cta: "Call to action",
  badge1: "Roundel line 1", badge2: "Roundel line 2", badge3: "Roundel line 3",
  tc: "T&Cs line", hashtag: "Hashtag",
  month: "Event month", dates: "Event dates (comma separated)",
  offer: "Offer value", offerLabel: "Offer label",
  foot1: "Footer line 1", foot2: "Footer line 2",
  kicker: "Kicker line", giant: "Giant display word", bar: "Offer bar text",
  days: "Big number (day count)",
};

function buildTemplatePicker() {
  const wrap = $("template-picker");
  wrap.innerHTML = "";
  TEMPLATES.forEach((t, i) => {
    const label = document.createElement("label");
    label.className = "tpl-card";
    label.innerHTML = `
      <input type="radio" name="template" value="${t.id}" ${i === 0 ? "checked" : ""}>
      <span class="tpl-name">${t.name}</span>
      <span class="tpl-hint">${t.hint}</span>`;
    wrap.appendChild(label);
  });
  wrap.addEventListener("change", () => { buildDynFields(); scheduleRender(); });
}

function buildDynFields() {
  const id = document.querySelector("input[name=template]:checked").value;
  const t = TEMPLATES.find((x) => x.id === id);
  const wrap = $("dyn-fields");
  wrap.innerHTML = "";
  for (const [key, val] of Object.entries(t.defaults)) {
    const row = document.createElement("label");
    row.className = "field";
    row.innerHTML = `<span>${FIELD_LABELS[key] || key}</span>`;
    const input = document.createElement("input");
    input.type = "text";
    input.value = val;
    input.dataset.key = key;
    input.addEventListener("input", scheduleRender);
    row.appendChild(input);
    wrap.appendChild(row);
  }
  for (const opt of t.options || []) {
    const row = document.createElement("label");
    row.className = "field";
    row.innerHTML = `<span>${opt.label}</span>`;
    const sel = document.createElement("select");
    sel.dataset.key = opt.key;
    for (const c of opt.choices) {
      const o = document.createElement("option");
      o.value = c; o.textContent = c.charAt(0).toUpperCase() + c.slice(1);
      sel.appendChild(o);
    }
    sel.addEventListener("change", scheduleRender);
    row.appendChild(sel);
    wrap.appendChild(row);
  }
  const note = document.createElement("p");
  note.className = "note";
  note.textContent = "Tokens {MODEL} {GRADE} {COLOUR} {PRICE} {DEALER} are replaced automatically.";
  wrap.appendChild(note);
}

/* ---------- uploads ---------- */
function wireFileInput(id, cb) {
  $(id).addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) { cb(null); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { cb(img); scheduleRender(); };
    img.src = url;
  });
}

function wireFontInput() {
  $("f-font").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const face = new FontFace("BrandFont", await file.arrayBuffer());
      await face.load();
      document.fonts.add(face);
      scheduleRender();
    } catch (err) {
      alert("Could not load that font file: " + err.message);
    }
  });
}

/* ---------- sizes + preview ---------- */
function buildSizeChecks() {
  const wrap = $("size-checks");
  wrap.innerHTML = "";
  for (const sz of AD_SIZES) {
    const label = document.createElement("label");
    label.className = "size-check";
    label.innerHTML = `<input type="checkbox" data-size="${sz.id}" ${sz.on ? "checked" : ""}>
      <span>${sz.label} <small>${sz.w}×${sz.h}</small></span>`;
    wrap.appendChild(label);
  }
  wrap.addEventListener("change", () => { buildPreviewGrid(); scheduleRender(); });
}

function selectedSizes() {
  return AD_SIZES.filter((sz) =>
    document.querySelector(`input[data-size="${sz.id}"]`)?.checked);
}

function buildPreviewGrid() {
  const grid = $("preview-grid");
  grid.innerHTML = "";
  for (const sz of selectedSizes()) {
    const card = document.createElement("div");
    card.className = "preview-card";
    card.innerHTML = `
      <div class="preview-head">
        <span>${sz.label}</span>
        <span class="preview-actions">
          <button class="btn small" data-pptx="${sz.id}" title="Layered file — upload to Canva or open in PowerPoint to move every element">PPTX</button>
          <button class="btn small" data-dl="${sz.id}">PNG</button>
        </span>
      </div>`;
    const canvas = document.createElement("canvas");
    canvas.dataset.sizeId = sz.id;
    card.appendChild(canvas);
    grid.appendChild(card);
    enableTextDrag(canvas);
  }
  grid.querySelectorAll("button[data-dl]").forEach((b) =>
    b.addEventListener("click", () => downloadOne(b.dataset.dl)));
  grid.querySelectorAll("button[data-pptx]").forEach((b) =>
    b.addEventListener("click", () => exportLayered(b.dataset.pptx)));
}

/* ---------- drag text on previews ---------- */
function layerHitAt(canvas, px, py) {
  const layers = canvas._layers || [];
  for (let i = layers.length - 1; i >= 0; i--) {
    const L = layers[i];
    if (!L.key) continue;
    let bx, by, bw, bh;
    if (L.type === "cta") { bx = L.x; by = L.y; bw = L.w; bh = L.h; }
    else if (L.type === "img") { bx = L.x; by = L.y; bw = L.w; bh = L.h; }
    else if (L.type === "text") {
      bw = L.w; bh = L.px * 1.3;
      bx = L.align === "center" ? L.x - bw / 2 : L.align === "right" ? L.x - bw : L.x;
      by = L.baseline === "middle" ? L.y - bh / 2 : L.y - L.px * 1.05;
    } else continue;
    const m = 8;
    if (px >= bx - m && px <= bx + bw + m && py >= by - m && py <= by + bh + m) return L;
  }
  return null;
}

function enableTextDrag(canvas) {
  let drag = null, raf = 0;
  canvas.style.touchAction = "none";
  const scale = () => {
    const r = canvas.getBoundingClientRect();
    return { sx: canvas.width / r.width, sy: canvas.height / r.height, r };
  };
  canvas.addEventListener("pointerdown", (e) => {
    const { sx, sy, r } = scale();
    const L = layerHitAt(canvas, (e.clientX - r.left) * sx, (e.clientY - r.top) * sy);
    if (!L) return;
    drag = {
      key: L.key, x0: e.clientX, y0: e.clientY,
      base: Object.assign({ dx: 0, dy: 0 }, NUDGE[L.key]),
      fx: sx / canvas.width, fy: sy / canvas.height,
    };
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = "grabbing";
    e.preventDefault();
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!drag) {
      const { sx, sy, r } = scale();
      canvas.style.cursor =
        layerHitAt(canvas, (e.clientX - r.left) * sx, (e.clientY - r.top) * sy) ? "grab" : "";
      return;
    }
    NUDGE[drag.key] = {
      dx: drag.base.dx + (e.clientX - drag.x0) * drag.fx,
      dy: drag.base.dy + (e.clientY - drag.y0) * drag.fy,
    };
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; renderOne(canvas); });
  });
  const end = () => { if (drag) { drag = null; canvas.style.cursor = ""; renderAll(); } };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
  canvas.addEventListener("dblclick", (e) => {
    const { sx, sy, r } = scale();
    const L = layerHitAt(canvas, (e.clientX - r.left) * sx, (e.clientY - r.top) * sy);
    if (L) { delete NUDGE[L.key]; renderAll(); }
  });
}

function renderOne(canvas) {
  const s = readState();
  const sz = AD_SIZES.find((x) => x.id === canvas.dataset.sizeId);
  REC = [];
  renderAd(canvas, sz, s.templateId, s, assets, { hint: true });
  canvas._layers = REC;
  REC = null;
}

let renderTimer = null;
function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(renderAll, 120);
}

function renderAll() {
  document.querySelectorAll("#preview-grid canvas").forEach(renderOne);
}

/* ---------- export ---------- */
function slug(str, fallback) {
  const s = (str || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return s || fallback;
}

function exportCanvasFor(sz, s) {
  const canvas = document.createElement("canvas");
  renderAd(canvas, sz, s.templateId, s, assets, { hint: false });
  return canvas;
}

function fileNameFor(s, sz) {
  return `${slug(s.dealer, "toyota")}-${slug(s.model, s.templateId)}-${sz.w}x${sz.h}.png`;
}

function saveBlob(blob, name) {
  return new Promise((resolve) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); resolve(); }, 250);
  });
}

function downloadCanvas(canvas, name) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => saveBlob(blob, name).then(resolve), "image/png");
  });
}

/* ---------- layered PPTX export (editable in Canva/PowerPoint) ---------- */
function colorToPptx(c) {
  c = String(c);
  let m = /^#([0-9a-f]{6})$/i.exec(c);
  if (m) return { color: m[1].toUpperCase(), transparency: 0 };
  m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(c);
  if (m) {
    const hex = [m[1], m[2], m[3]]
      .map((v) => (+v).toString(16).padStart(2, "0")).join("").toUpperCase();
    const a = m[4] === undefined ? 1 : +m[4];
    return { color: hex, transparency: Math.round((1 - a) * 100) };
  }
  return { color: "000000", transparency: 0 };
}

function imgToDataUrl(img) {
  if (img instanceof HTMLCanvasElement) return img.toDataURL("image/png");
  const c = document.createElement("canvas");
  c.width = img.naturalWidth || img.width;
  c.height = img.naturalHeight || img.height;
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/png");
}

async function exportLayered(sizeId) {
  if (typeof PptxGenJS === "undefined") {
    alert("The PowerPoint export library did not load."); return;
  }
  const s = readState();
  const sz = AD_SIZES.find((x) => x.id === sizeId);
  const IN = 96; // px per inch
  const layers = renderAdLayers(sz, s.templateId, s, assets);
  const bg = renderAdBackground(sz, s.templateId, s, assets);

  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "ad", width: sz.w / IN, height: sz.h / IN });
  pptx.layout = "ad";
  const slide = pptx.addSlide();
  slide.addImage({ data: bg.toDataURL("image/png"), x: 0, y: 0, w: sz.w / IN, h: sz.h / IN });

  for (const L of layers) {
    if (L.type === "img") {
      slide.addImage({ data: imgToDataUrl(L.img), x: L.x / IN, y: L.y / IN, w: L.w / IN, h: L.h / IN });
    } else if (L.type === "cta") {
      slide.addText(L.text, {
        shape: "roundRect", rectRadius: Math.min(L.w, L.h) / 2 / IN,
        fill: { color: colorToPptx(L.bg).color },
        color: colorToPptx(L.fg).color,
        x: L.x / IN, y: L.y / IN, w: L.w / IN, h: L.h / IN,
        align: "center", valign: "middle",
        fontSize: Math.max(6, L.px * 0.75), bold: true, fontFace: "Arial",
        margin: 0,
      });
    } else {
      const padW = L.w + L.px;
      const bx = L.align === "center" ? L.x - padW / 2
        : L.align === "right" ? L.x - padW + L.px * 0.5
        : L.x - L.px * 0.5;
      const bh = L.px * 1.5;
      const by = L.baseline === "middle" ? L.y - bh / 2 : L.y - L.px * 1.08;
      const col = colorToPptx(L.color);
      slide.addText(L.text, {
        x: bx / IN, y: by / IN, w: padW / IN, h: bh / IN,
        align: L.align === "right" ? "right" : L.align === "center" ? "center" : "left",
        valign: "middle",
        fontSize: Math.max(6, L.px * 0.75), bold: L.weight >= 700,
        fontFace: "Arial",
        color: col.color, transparency: col.transparency,
        margin: 0, wrap: false,
      });
    }
  }
  const blob = await pptx.write("blob");
  await saveBlob(blob, fileNameFor(s, sz).replace(/\.png$/, "") + "-layered.pptx");
}

function downloadOne(sizeId) {
  const s = readState();
  const sz = AD_SIZES.find((x) => x.id === sizeId);
  downloadCanvas(exportCanvasFor(sz, s), fileNameFor(s, sz));
}

async function downloadAll() {
  const s = readState();
  for (const sz of selectedSizes()) {
    await downloadCanvas(exportCanvasFor(sz, s), fileNameFor(s, sz));
  }
}

/* ---------- brand rules page ---------- */
const RULES_KEY = "adbuilder_rules";

function loadRules() {
  try {
    Object.assign(RULES, RULES_DEFAULTS,
      JSON.parse(localStorage.getItem(RULES_KEY)) || {});
  } catch { Object.assign(RULES, RULES_DEFAULTS); }
}
function saveRules() {
  try { localStorage.setItem(RULES_KEY, JSON.stringify(RULES)); } catch {}
}

function fmtRuleVal(key) {
  const v = RULES[key];
  if (typeof v === "boolean") return v ? "On" : "Off";
  if (key === "owafWidthPct") return v + "%";
  return "×" + Number(v).toFixed(2).replace(/0$/, "");
}

function buildRulesPage() {
  const body = $("rules-body");
  body.innerHTML = "";
  for (const group of RULE_BOOK) {
    const g = document.createElement("div");
    g.className = "rules-group";
    g.innerHTML = `<h4>${group.group}</h4>`;
    for (const item of group.items) {
      const row = document.createElement("div");
      row.className = "rule-item" + (item.key ? " tunable" : "");
      const tag = item.key ? "SETTING" : "LOCKED";
      let ctl = "";
      row.innerHTML = `<span class="lock">${tag}</span><div><span>${item.text}</span></div>`;
      if (item.key) {
        const wrap = document.createElement("div");
        wrap.className = "ctl";
        if (item.type === "toggle") {
          const cb = document.createElement("input");
          cb.type = "checkbox";
          cb.checked = !!RULES[item.key];
          cb.addEventListener("change", () => {
            RULES[item.key] = cb.checked;
            saveRules(); refreshRuleVals(); scheduleRender();
          });
          wrap.appendChild(cb);
        } else {
          const r = document.createElement("input");
          r.type = "range";
          r.min = item.min; r.max = item.max; r.step = item.step;
          r.value = RULES[item.key];
          r.addEventListener("input", () => {
            RULES[item.key] = +r.value;
            saveRules(); refreshRuleVals(); scheduleRender();
          });
          wrap.appendChild(r);
        }
        const val = document.createElement("span");
        val.className = "val";
        val.dataset.ruleKey = item.key;
        val.textContent = fmtRuleVal(item.key);
        wrap.appendChild(val);
        row.querySelector("div").appendChild(wrap);
      }
      g.appendChild(row);
    }
    body.appendChild(g);
  }
}

function refreshRuleVals() {
  document.querySelectorAll("[data-rule-key]").forEach((el) => {
    el.textContent = fmtRuleVal(el.dataset.ruleKey);
  });
}

function wireRulesPage() {
  $("rules-btn").addEventListener("click", () => { $("rules-overlay").hidden = false; });
  $("rules-close").addEventListener("click", () => { $("rules-overlay").hidden = true; });
  $("rules-overlay").addEventListener("click", (e) => {
    if (e.target === $("rules-overlay")) $("rules-overlay").hidden = true;
  });
  $("rules-reset").addEventListener("click", () => {
    Object.assign(RULES, RULES_DEFAULTS);
    saveRules(); buildRulesPage(); scheduleRender();
  });
}

/* ---------- boot ---------- */
function startApp(userEmail) {
  loadRules();
  buildRulesPage();
  wireRulesPage();
  $("user-email").textContent = userEmail;
  $("logout-btn").addEventListener("click", () => { logoutUser(); location.reload(); });

  buildTemplatePicker();
  buildDynFields();
  fillSelect($("f-dealer"), allDealers(), false);
  fillSelect($("f-model"), allModels(), false);
  refreshGrades();
  fillSelect($("f-colour"), allColours(), false);
  buildSizeChecks();
  buildPreviewGrid();

  wireOther("f-dealer", "f-dealer-other-wrap");
  wireOther("f-model", "f-model-other-wrap");
  wireOther("f-grade", "f-grade-other-wrap");
  wireOther("f-colour", "f-colour-other-wrap");
  wireSaveButtons();

  ["f-price", "f-disclaimer", "f-accent", "f-dealer-details",
   "f-dealer-other", "f-model-other", "f-grade-other", "f-colour-other"].forEach((id) =>
    $(id).addEventListener("input", scheduleRender));

  wireFileInput("f-bg", (img) => { assets.bg = img; });
  wireFileInput("f-logo", (img) => { assets.logo = img; });
  wireFileInput("f-owaf", (img) => { assets.owaf = img; });
  for (let i = 1; i <= 3; i++) {
    const idx = i - 1;
    wireFileInput("f-veh" + i, (img) => {
      assets.vehiclesRaw[idx] = img;
      delete NUDGE["veh" + i];
      processVehicles();
    });
    $("f-veh" + i + "-scale").addEventListener("input", scheduleRender);
  }
  $("f-strip-white").addEventListener("change", processVehicles);
  ["f-branding", "f-logo-align", "f-cta-style",
   "f-owaf-variant", "f-scrim-mode"].forEach((id) =>
    $(id).addEventListener("change", scheduleRender));
  ["f-scrim"].forEach((id) =>
    $(id).addEventListener("input", scheduleRender));
  wireFontInput();

  // masterbrand accent swatches
  const sw = $("swatches");
  for (const { name, hex } of BRAND_SWATCHES) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "swatch";
    b.title = `${name} ${hex}`;
    b.style.background = hex;
    b.addEventListener("click", () => { $("f-accent").value = hex; scheduleRender(); });
    sw.appendChild(b);
  }

  $("download-all").addEventListener("click", downloadAll);
  $("reset-nudge").addEventListener("click", () => {
    for (const k of Object.keys(NUDGE)) delete NUDGE[k];
    renderAll();
  });

  loadDealerLogos();
  loadOwafPack();
  renderAll();
}

document.addEventListener("DOMContentLoaded", () => initAuthUI(startApp));
