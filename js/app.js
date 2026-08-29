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

const assets = { bg: null, logo: null, owaf: null };
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
    accent: $("f-accent").value || BRAND.red,
    owafPos: $("f-owaf-pos").value,
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
        <button class="btn small" data-dl="${sz.id}">PNG</button>
      </div>`;
    const canvas = document.createElement("canvas");
    canvas.dataset.sizeId = sz.id;
    card.appendChild(canvas);
    grid.appendChild(card);
  }
  grid.querySelectorAll("button[data-dl]").forEach((b) =>
    b.addEventListener("click", () => downloadOne(b.dataset.dl)));
}

let renderTimer = null;
function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(renderAll, 120);
}

function renderAll() {
  const s = readState();
  document.querySelectorAll("#preview-grid canvas").forEach((canvas) => {
    const sz = AD_SIZES.find((x) => x.id === canvas.dataset.sizeId);
    renderAd(canvas, sz, s.templateId, s, assets, { hint: true });
  });
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

function downloadCanvas(canvas, name) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); resolve(); }, 250);
    }, "image/png");
  });
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

/* ---------- boot ---------- */
function startApp(userEmail) {
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

  ["f-price", "f-disclaimer", "f-accent",
   "f-dealer-other", "f-model-other", "f-grade-other", "f-colour-other"].forEach((id) =>
    $(id).addEventListener("input", scheduleRender));

  wireFileInput("f-bg", (img) => { assets.bg = img; });
  wireFileInput("f-logo", (img) => { assets.logo = img; });
  wireFileInput("f-owaf", (img) => { assets.owaf = img; });
  $("f-owaf-pos").addEventListener("change", scheduleRender);
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

  renderAll();
}

document.addEventListener("DOMContentLoaded", () => initAuthUI(startApp));
