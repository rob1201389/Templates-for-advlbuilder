/* ============================================================
   AdBuilder data: Toyota Australia line-up, colours, sizes,
   template definitions.
   Edit these lists freely — the app also lets users add their
   own entries in-app (saved to the browser via localStorage).
   ============================================================ */

/* Dealerships selectable in every template. "Other…" in the app lets
   users type and save additional names. */
const DEALERSHIPS = [
  "Chatswood Toyota",
  "Ryde Toyota",
  "Chatswood & Ryde Toyota",
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
  { name: "Black",      hex: BRAND.black },
  { name: "Charcoal",   hex: BRAND.charcoal },
  { name: "Slate",      hex: BRAND.slate },
  { name: "Grey",       hex: BRAND.grey },
];

/* Template definitions. Text fields support tokens:
   {MODEL} {GRADE} {COLOUR} {PRICE} {DEALER} — replaced at render time. */
const TEMPLATES = [
  {
    id: "arrival",
    name: "Stock arrival — dark panel",
    hint: "Big two-line headline on a black side panel (“HERE NOW” style).",
    defaults: {
      h1: "HERE", h2: "NOW",
      sub1: "NEW {MODEL}", sub2: "STOCK HAS LANDED",
      tagline: "New stock arriving daily",
      cta: "Get quote",
    },
  },
  {
    id: "clearance",
    name: "Clearance — stacked headline",
    hint: "Model name, red CLEARANCE, ON NOW over the photo.",
    defaults: {
      h1: "{MODEL}", h2: "CLEARANCE", h3: "ON NOW",
      cta: "Contact us",
    },
  },
  {
    id: "driveaway",
    name: "Driveaway price",
    hint: "Large price over the photo with a pill-outline sub-line.",
    defaults: {
      h1: "{PRICE}*", h2: "DRIVEAWAY",
      pill: "DRIVEAWAY WITHOUT DELAY",
      cta: "See details",
    },
  },
  {
    id: "announce",
    name: "Announcement — photo + text block",
    hint: "Photo on top, bold headline and CTA bar underneath.",
    defaults: {
      h1: "{MODEL} {GRADE} STOCK NOW ARRIVING",
      sub1: "EXPLORE THE TOYOTA RANGE",
      cta: "Learn more",
    },
  },
  {
    id: "promo",
    name: "Seasonal promo",
    hint: "Headline top (black + red line), photo centre, CTA button.",
    defaults: {
      h1: "THE LAST BLAST OF", h2: "WINTER DEALS",
      cta: "Book a test drive!",
    },
  },
];
