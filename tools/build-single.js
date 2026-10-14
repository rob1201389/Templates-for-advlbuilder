#!/usr/bin/env node
/* Bundle the app into one self-contained HTML file (for Cloudflare Pages
   path hosting and the claude.ai demo artifact): inlines the stylesheet,
   all scripts and the logo/OWAF assets as data URIs, and guards
   localStorage for sandboxed iframes. */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const GUARD = `function safeLS() {
  try { const t = window.localStorage; t.getItem; return t; }
  catch (e) { return { getItem: () => null, setItem: () => {}, removeItem: () => {} }; }
}\n`;

function inlineAssets(src) {
  return src.replace(/assets\/logos\/([\w.-]+\.png)/g, (m, name) => {
    const b64 = fs.readFileSync(path.join(ROOT, "assets/logos", name)).toString("base64");
    return `data:image/png;base64,${b64}`;
  });
}

function script(p, guard) {
  let src = read(p);
  if (guard) src = src.replace(/\blocalStorage\./g, "safeLS().");
  return `<script>\n${inlineAssets(src)}\n</script>`;
}

let html = read("index.html");
// NB: function replacements, so "$&"-style sequences in code survive intact
html = html.replace('<link rel="stylesheet" href="css/styles.css">',
  () => `<style>\n${read("css/styles.css")}\n</style>`);
html = html.replace('<script src="js/vendor/pptxgen.bundle.js"></script>',
  () => `<script>\n${read("js/vendor/pptxgen.bundle.js")}\n</script>`);
html = html.replace('<script src="js/data.js"></script>',
  () => `<script>\n${GUARD}</script>\n${script("js/data.js", true)}`);
html = html.replace('<script src="js/auth.js"></script>', () => script("js/auth.js", true));
html = html.replace('<script src="js/render.js"></script>', () => script("js/render.js", true));
html = html.replace('<script src="js/app.js"></script>', () => script("js/app.js", true));

const out = process.argv[2] || "dist/index.html";
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
fs.writeFileSync(out, html);
console.log("wrote", out, fs.statSync(out).size, "bytes");
