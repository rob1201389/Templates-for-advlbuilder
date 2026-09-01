# RSMotoCons — rsmotocons.com

Marketing website for **RSMotoCons**: dealership operations tools built on 20 years
of automotive experience — inventory, marketing, sales, and finance for the next
generation of dealer management.

Static site — no build step required.

## Files

- `index.html` — main site (hero, tools, about/story, why us, contact)
- `logo.svg` — full RSMotoCons logo (gauge emblem + wordmark)
- `favicon.svg` — square emblem mark, used as favicon and header icon
- `404.html` — custom not-found page (Cloudflare Pages picks this up automatically)
- `_headers` — Cloudflare Pages security/caching headers

## Deploying to Cloudflare Pages

1. In the Cloudflare dashboard go to **Workers & Pages → Create → Pages → Connect to Git**.
2. Select this repository.
3. Build settings:
   - **Framework preset:** None
   - **Build command:** *(leave empty)*
   - **Build output directory:** `/`
4. Deploy, then add the custom domain: **Pages project → Custom domains → add `rsmotocons.com`**
   (and `www.rsmotocons.com`). Cloudflare will configure DNS automatically if the
   domain's nameservers are already on Cloudflare.

## Contact form

The form currently uses a `mailto:` fallback to `info@rsmotocons.com`. For real
submissions, swap it for a Cloudflare Pages Function or a form service and update
the email address in `index.html` if yours differs.
