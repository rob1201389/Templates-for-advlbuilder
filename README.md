# Chatswood & Ryde Toyota Social Assets Helper

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
- **Dealership picker** — Chatswood Toyota, Ryde Toyota, or the combined
  "Chatswood & Ryde Toyota", plus Other… for ad-hoc names (savable to
  your list). Edit the base list in `DEALERSHIPS` in `js/data.js`.
- **Official artwork built in** (`assets/logos/`) — the dealer composite
  lockups load automatically for the selected dealership and are tinted
  to suit each template; the official OWAF "OH WHAT A FEELING" files
  (stacked white/black, single-line red) are placed automatically with
  an Auto-per-template variant picker.
- **Customisable fields** — model, grade, colour, price,
  headlines, sub-lines, tagline, CTA, disclaimer, accent colour.
  Copy fields support tokens `{MODEL} {GRADE} {COLOUR} {PRICE} {DEALER}`.
- **Toyota Australia line-up built in** — models, grades and colours are
  pre-loaded (see `js/data.js`). Every dropdown also has an **Other…**
  option; typed entries can be saved to your own list (stored in the
  browser) with the **＋ Save** button.
- **Masterbrand compliance** (Dealer Masterbrand Quick Reference Guide):
  - Exact colour palette built in — Toyota Red `#EB0A1E` (PMS 186C),
    Black, Charcoal `#1A1A1A`, Slate `#3A3A3A`, Grey `#808080`, Steel,
    Light Grey, Web Grey — with one-click accent swatches.
  - Typography follows the rule "Toyota Type is the only font; where
    unavailable, Arial must be used": the app renders in Arial until you
    upload a Toyota Type font file, which then takes priority. No italics
    are used anywhere.
  - Upload slots for the **dealer composite logo / Toyota product logo**
    and the official **OWAF "OH WHAT A FEELING" tagline logo** (placed as
    the AdBuilder logo file, never typed out), with auto or manual corner
    placement.
- **Imagery** — upload a vehicle/background photo; templates cover-fit it
  per aspect ratio.
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
