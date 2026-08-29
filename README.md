# Social Ad Builder — Toyota Dealer Templates

A standalone, browser-based app for producing dealer social-media and display
ads from reusable templates. No build step, no server required — open
`index.html` in a browser, or host the folder anywhere static
(GitHub Pages, Netlify, an intranet share).

## What it does

- **Login gate** — create an account (email + password) on first run.
  Accounts are stored in the browser (salted + hashed in `localStorage`).
- **5 template styles**, modelled on common dealer ad formats:
  1. **Stock arrival** — big two-line headline on a dark circular panel ("HERE NOW")
  2. **Clearance** — stacked headline over the photo (model / CLEARANCE / ON NOW)
  3. **Driveaway price** — large price with a pill-outline sub-line
  4. **Announcement** — photo block + bold headline + CTA bar
  5. **Seasonal promo** — headline top, vehicle photo centre, CTA button
- **Customisable fields** — dealer name, model, grade, colour, price,
  headlines, sub-lines, tagline, CTA, disclaimer, accent colour.
  Copy fields support tokens `{MODEL} {GRADE} {COLOUR} {PRICE} {DEALER}`.
- **Toyota Australia line-up built in** — models, grades and colours are
  pre-loaded (see `js/data.js`). Every dropdown also has an **Other…**
  option; typed entries can be saved to your own list (stored in the
  browser) with the **＋ Save** button.
- **Imagery & brand** — upload a vehicle/background photo, a dealer or
  Toyota logo (transparent PNG recommended), and optionally the brand
  font file (`.woff2/.ttf/.otf`) so exports use the masterbrand typeface.
- **One-click export** — PNGs at exact pixel sizes:
  | Size | Use |
  |---|---|
  | 1080 × 1080 (1:1) | Feed post |
  | 1920 × 1080 (16:9) | Landscape |
  | 1080 × 1920 (9:16) | Story / Reel |
  | 1200 × 628 | Link-ad banner |
  | 300 × 250 | MREC display |
  | 728 × 90 | Leaderboard display |

## Running it

```bash
# option A: just open the file
open index.html

# option B: serve it (recommended for font uploads in some browsers)
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Updating the line-up or adding templates

- **Models / grades / colours:** edit the arrays at the top of `js/data.js`.
- **Brand palette:** `BRAND` in `js/data.js` (accent colour is also
  adjustable per-ad in the UI).
- **Templates:** add an entry to `TEMPLATES` in `js/data.js` and a matching
  draw function in `js/render.js` (register it in `TEMPLATE_RENDERERS`).

## Notes & limitations

- The login is a client-side convenience gate for a static app — accounts
  live only in each browser. For shared, real authentication, host the app
  behind an access layer (e.g. Cloudflare Access / Netlify password) or a
  small backend.
- Saved "Other" list entries are per-browser (`localStorage`).
- Exports are drawn on `<canvas>` at exact pixel dimensions, so what you
  download is print-sharp for each placement.
