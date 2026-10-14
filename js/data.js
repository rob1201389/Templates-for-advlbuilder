/* ============================================================
   AdBuilder data: Toyota Australia line-up, colours, sizes,
   template definitions.
   Edit these lists freely — the app also lets users add their
   own entries in-app (saved to the browser via localStorage).
   ============================================================ */

/* PORTAL_MODE: set to true when the app is hosted behind a real login
   layer (e.g. Cloudflare Access, which verifies each user's email
   before the page loads). The app then skips its own browser-stored
   login screen, since the portal has already authenticated the user. */
const PORTAL_MODE = true; // login disabled for now (set false to restore it)

/* Dealerships selectable in every template. "Other…" in the app lets
   users type and save additional names. */
const DEALERSHIPS = [
  "Chatswood Toyota",
  "Ryde Toyota",
  "Chatswood & Ryde Toyota",
];

/* Official dealer composite lockups (white ink on transparency,
   composed from AdBuilder artwork). The app tints them to suit each
   template, so one file serves dark and light layouts. */
const DEALER_LOGOS = {
  "Chatswood Toyota":        { h: "assets/logos/chatswood-h.png" },
  "Ryde Toyota":             { h: "assets/logos/ryde-h.png" },
  "Chatswood & Ryde Toyota": { h: "assets/logos/combined-h.png" },
};

/* Official OWAF tagline files (never typed out, per masterbrand). */
const OWAF_FILES = {
  white: "assets/logos/owaf-stacked-white.png",
  black: "assets/logos/owaf-stacked-black.png",
  red:   "assets/logos/owaf-single-red.png",
};

/* Toyota Product vertical logo (white ink; the app tints it). Per the
   masterbrand golden rules this is the only logo used in
   communications, and it must never be duplicated in a layout. */
const TOYOTA_LOGO_FILE = "assets/logos/toyota-vertical.png";

/* ============================================================
   BRAND RULES — the live settings that drive the render engine.
   Defaults match the Toyota Masterbrand Guidelines; the Brand
   Rules page shows every rule with its source, and the few
   tunable values below can be adjusted there (within the ranges
   the guidelines allow).
   ============================================================ */
const RULES_DEFAULTS = {
  logoScale: 1.0,       // multiplier on the spec logo size
  marginScale: 1.0,     // 1.0 = margins at 40% of logo height
  owafWidthPct: 175,    // OWAF width as % of Toyota logo width
  showToyotaLogo: true, // untick to output artwork without the logo
  showDealerHeader: true,
  showSignOff: true,
};
let RULES = Object.assign({}, RULES_DEFAULTS);

/* The rule book shown on the Brand Rules page. Locked rules are
   enforced in code and cannot be changed; keyed rules bind to the
   RULES values above. */
const RULE_BOOK = [
  {
    group: "Logo — 'Big respect' (Advertising golden rules)",
    items: [
      { locked: true, text: "The Toyota Product VERTICAL logo (emblem over TOYOTA) is used on all paid communications. The horizontal logo is never used in communications." },
      { locked: true, text: "The Toyota logo is never duplicated in a layout. Dealer composite lock-ups are reserved for restricted-space and identity applications, so they are not placed on standard ads." },
      { locked: true, text: "Logo sits top left, centre or right; headline, CTA, tagline and disclaimers follow the logo/text alignment." },
      { key: "showToyotaLogo", type: "toggle",
        text: "Show the Toyota logo on the artwork (untick for creative where the logo is carried elsewhere — note the guidelines expect it on paid communications):" },
      { key: "logoScale", type: "range", min: 0.7, max: 1.4, step: 0.05,
        text: "Logo size follows the layout-shape specification (≈H/6 landscape, ≈H/7 square, width-based portrait). Fine-tune multiplier:" },
      { key: "marginScale", type: "range", min: 0.75, max: 1.25, step: 0.05,
        text: "Margins run 30–50% of the Toyota logo height (guideline default 40%). Fine-tune multiplier:" },
    ],
  },
  {
    group: "Dealer tagging (as text, not logos)",
    items: [
      { locked: true, text: "The dealership appears as text: a dealer tag header at the top (Toyota Type Semibold, title case, cap height ≈ Toyota logo cap height) and/or a sign-off at the base." },
      { locked: true, text: "The sign-off (dealer name semibold + details regular) is placed at the bottom of the communication and reads before 'OWAF' and the disclaimer." },
      { key: "showDealerHeader", type: "toggle", text: "Show the dealer tag header at the top:" },
      { key: "showSignOff", type: "toggle", text: "Show the dealer sign-off at the base:" },
    ],
  },
  {
    group: "OWAF — 'Always feeling it'",
    items: [
      { locked: true, text: "'OH WHAT A FEELING' supports the Toyota logo on all paid communications, using the official logo files only — never typed out." },
      { locked: true, text: "OWAF sits at the base of the layout and follows the text/logo alignment. Red on light surfaces; white on black or imagery." },
      { key: "owafWidthPct", type: "range", min: 150, max: 200, step: 5,
        text: "OWAF width is 175% of the Toyota logo width (200% for out-of-home). Current %:" },
    ],
  },
  {
    group: "Colour — 'Own your colour'",
    items: [
      { locked: true, text: "Backgrounds and strips use white, black and Toyota Red (#EB0A1E, PMS 186C) only — never grey. Red devices switch to black on red backgrounds." },
      { locked: true, text: "Where possible the accent red features in all creative." },
    ],
  },
  {
    group: "Typography — 'Style masters'",
    items: [
      { locked: true, text: "Toyota Type is the only brand typeface. Where unavailable, Arial is used (the app renders Arial until a Toyota Type file is loaded in panel 4). No italics, ever." },
      { locked: true, text: "Disclaimers: Toyota Type Regular, sentence case, forced justified with the last line following the headline alignment, placed under 'OWAF' at the base." },
    ],
  },
  {
    group: "Layouts & devices",
    items: [
      { locked: true, text: "Three layout families: full-bleed image; colour background (white/black/red); strip — a white/red/black band on any edge, 30–60% of the layout when with imagery." },
      { locked: true, text: "Text holders (red roundel, pill, rounded square) may be used to focus attention on offers. Balloons are not permitted; celebration style uses circular confetti/firework particle graphics." },
      { locked: true, text: "CTA styles: red pill (maximum standout), text-only uppercase (medium), sentence case with arrow (minimal). One style per campaign." },
    ],
  },
  {
    group: "Social media",
    items: [
      { locked: true, text: "Branding toggle (panel 4): Social ad = no Toyota logo, OWAF or dealer tags (copy, price and CTAs stay — the dealer social style). Masterbrand = full furniture for print/paid brand placements. Organic = imagery only, no CTA (17.3/17.4)." },
      { locked: true, text: "Feed creative 1:1, stories 9:16, images under 20% text where placements require it. Display picture: white Toyota vertical logo on a black circle." },
    ],
  },
  {
    group: "Approval",
    items: [
      { locked: true, text: "Dealer-developed creative requires TMCA brand approval (AdBuilder Brand Support) before running. This tool produces artwork structured to the guidelines; approval is still the final gate." },
    ],
  },
];

const TOYOTA_MODELS = [
  { name: "Yaris",            grades: ["Ascent Sport", "SX", "ZR"] },
  { name: "Yaris Cross",      grades: ["GX", "GXL", "Urban"] },
  { name: "Corolla Hatch",    grades: ["Ascent Sport", "SX", "ZR"] },
  { name: "Corolla Sedan",    grades: ["Ascent Sport", "SX", "ZR"] },
  { name: "Corolla Cross",    grades: ["GX", "GXL", "Atmos"] },
  { name: "Camry",            grades: ["Ascent", "Ascent Sport", "SL"] },
  { name: "C-HR",             grades: ["GXL", "Koba", "GR Sport"] },
  { name: "RAV4",             grades: ["GX", "GXL", "XSE", "Cruiser", "Edge", "GR Sport"] },
  { name: "Kluger",           grades: ["GX", "GXL", "Grande"] },
  { name: "Prado",            grades: ["GX", "GXL", "VX", "Altitude", "Kakadu"] },
  { name: "Fortuner",         grades: ["GX", "GXL", "Crusade"] },
  { name: "LandCruiser 300",  grades: ["GX", "GXL", "VX", "Sahara", "Sahara ZX", "GR Sport"] },
  { name: "LandCruiser 70",   grades: ["WorkMate", "GX", "GXL"] },
  { name: "HiLux",            grades: ["WorkMate", "SR", "SR5", "Rogue", "GR Sport"] },
  { name: "HiAce",            grades: ["LWB Van", "SLWB Van", "Commuter Bus"] },
  { name: "Granvia",          grades: ["Granvia", "Granvia VX"] },
  { name: "Coaster",          grades: ["Standard", "Deluxe"] },
  { name: "Tundra",           grades: ["Limited"] },
  { name: "bZ4X",             grades: ["FWD", "AWD"] },
  { name: "GR86",             grades: ["GT", "GTS"] },
  { name: "GR Yaris",         grades: ["GT", "GTS"] },
  { name: "GR Corolla",       grades: ["GTS"] },
  { name: "GR Supra",         grades: ["GT", "GTS"] },
];

const TOYOTA_COLOURS = [
  "Glacier White", "Frosted White", "Crystal Pearl", "Silver Sky",
  "Stunning Silver", "Silver Rush", "Graphite", "Massive Grey",
  "Ebony", "Eclipse Black", "Feverish Red", "Emotional Red",
  "Atomic Rush", "Volcanic Red", "Merlot Red", "Saturn Blue",
  "Dark Blue", "Eclectic Blue", "Nebula Blue", "Ink",
  "Oxide Bronze", "Dusty Bronze", "Bronze", "Sandstone",
  "Jungle Khaki", "Tanami Taupe",
];

/* Export sizes. `on` = ticked by default. */
const AD_SIZES = [
  { id: "sq",   label: "Square 1:1 — feed post",   w: 1080, h: 1080, on: true  },
  { id: "ls",   label: "Landscape 16:9",           w: 1920, h: 1080, on: true  },
  { id: "pt",   label: "Story / Reel 9:16",        w: 1080, h: 1920, on: true  },
  { id: "fb",   label: "Link-ad banner 1200×628",  w: 1200, h: 628,  on: true  },
  { id: "vb",   label: "Vertical banner 216×360",  w: 216,  h: 360,  on: true  },
  { id: "mrec", label: "MREC 300×250",             w: 300,  h: 250,  on: false },
  { id: "lb",   label: "Leaderboard 728×90",       w: 728,  h: 90,   on: false },
];

/* Brand palette — Dealer Masterbrand Quick Reference Guide.
   Toyota Red PMS 186C / RGB 235 10 30. */
const BRAND = {
  red:       "#EB0A1E",
  black:     "#000000",
  charcoal:  "#1A1A1A",
  slate:     "#3A3A3A",
  grey:      "#808080",
  steel:     "#CCCCCC",
  lightGrey: "#EEEEEE",
  webGrey:   "#F5F5F5",
  white:     "#FFFFFF",
};

/* Quick-pick accent swatches shown next to the colour picker. */
const BRAND_SWATCHES = [
  { name: "Toyota Red", hex: BRAND.red },
  { name: "Hybrid Blue — off-guideline, needs TMCA approval", hex: "#2E64F5" },
  { name: "Black",      hex: BRAND.black },
  { name: "Charcoal",   hex: BRAND.charcoal },
  { name: "Slate",      hex: BRAND.slate },
  { name: "Grey",       hex: BRAND.grey },
];

/* Template definitions. Text fields support tokens:
   {MODEL} {GRADE} {COLOUR} {PRICE} {DEALER} — replaced at render time. */
const TEMPLATES = [
  {
    id: "fullbleed",
    name: "Full-bleed image",
    hint: "Masterbrand layout: headline over the photo, brand furniture at the base.",
    defaults: {
      h1: "The all-new {MODEL}",
      sub1: "Available for immediate delivery",
      cta: "Learn more",
    },
  },
  {
    id: "rangehero",
    name: "Range hero — centred stack",
    hint: "Full-bleed image, centred kicker + two-line giant headline (second line in the accent colour), pill and dealer line under the vehicles.",
    defaults: {
      kicker: "Lead the pack in the",
      h1: "NEW", h2: "{MODEL}",
      sub1: "Take immediate delivery",
      cta: "Across the range",
      foot1: "at {DEALER}",
    },
  },
  {
    id: "strip",
    name: "Strip",
    hint: "Masterbrand layout: a white, red or black strip on any edge carries the message.",
    defaults: {
      h1: "{MODEL} {GRADE}",
      sub1: "In stock now",
      offer: "From {PRICE}* driveaway",
      cta: "Enquire now",
    },
    options: [
      { key: "stripEdge", label: "Strip edge", choices: ["bottom", "top", "left", "right"] },
      { key: "stripColour", label: "Strip colour", choices: ["white", "red", "black"] },
    ],
  },
  {
    id: "colourbg",
    name: "Colour background",
    hint: "Masterbrand layout: solid white, black or red; vehicle cutout and a price roundel.",
    defaults: {
      h1: "All-new {MODEL}",
      sub1: "More space. More power. More adventure.",
      badge1: "NOW FROM", badge2: "{PRICE}*", badge3: "DRIVEAWAY",
      cta: "Book a test drive",
    },
    options: [
      { key: "bgColour", label: "Background colour", choices: ["white", "black", "red"] },
    ],
  },
  {
    id: "offer",
    name: "Retail offer",
    hint: "White retail layout: price lockup, vehicle cutout, red base strip with sign-off and OWAF.",
    defaults: {
      h1: "{MODEL} {GRADE}",
      sub1: "Ready for immediate delivery",
      tc: "*T&C's apply. Price relates to {MODEL} {GRADE}.",
      cta: "Get our stocklist",
    },
  },
  {
    id: "spotlight",
    name: "Launch spotlight",
    hint: "Black colour background with circle energy; model name in giant type behind the cutout.",
    defaults: {
      kicker: "The all-new",
      giant: "{MODEL}",
      sub1: "Available for immediate delivery",
      cta: "Reserve yours",
    },
  },
  {
    id: "event",
    name: "Sale event",
    hint: "White retail layout with a date card and offer roundel (text-holder devices).",
    defaults: {
      month: "August",
      dates: "21st Friday, 22nd Saturday, 23rd Sunday",
      h1: "READY | SET", h2: "TRADE",
      offer: "$3,000*", offerLabel: "Trade-In Bonus",
      badge1: "3 DAYS", badge2: "ONLY",
      hashtag: "#LandABetterDeal",
      cta: "Book now",
    },
  },
  {
    id: "lineup",
    name: "Big word — showroom lineup",
    hint: "Giant accent-colour word over the photo, up to 3 vehicles, white base panel with black headline and pill CTA.",
    defaults: {
      kicker: "{DEALER}",
      giant: "Electrify",
      h1: "Your drive now",
      sub1: "30+ electrified Toyotas ready for immediate delivery.",
      cta: "Enquire now",
    },
  },
  {
    id: "saleburst",
    name: "Sale burst — day count",
    hint: "Night-sky fireworks backdrop, giant save line, white day-count block, vehicle and event name. Built for weekend sales.",
    defaults: {
      kicker: "2025 plate",
      h1: "Save {PRICE}",
      days: "3",
      h2: "Day sale",
      sub1: "This weekend only",
      cta: "Shop now",
    },
  },
  {
    id: "pricetag",
    name: "Price pill — offer story",
    hint: "Photo background, left-aligned offer headline, vehicle, accent price pill with driveaway tag and CTA.",
    defaults: {
      kicker: "All-new {MODEL} {GRADE}",
      h1: "$5,000 Deposit Bonus^",
      tagline: "Drive away",
      cta: "See details",
    },
  },
];
