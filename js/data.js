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
];
