# Tiranga Agarbatti: shop and company website

The new **tirangaagarbatti.com**: the online shop for Tiranga and Sacred, and the company site for Maa Kamakhya Darbar Fragrances,
with its own admin at **/admin** and an orders screen at **/admin/orders.html**.
No WordPress and no monthly fees: products and pages live in this GitHub repo, orders live in Netlify, payments go through PhonePe.

```
You edit in /admin  →  the admin saves to GitHub  →  Netlify rebuilds  →  live in 1 to 2 minutes
```

## Editing the site (no code)

Open `https://<your-site>/admin` and sign in. You will see three sections:

| Section | What it controls |
| --- | --- |
| **Products** | The products page. Name, brand, category, photos, price and MRP, pack size, buy link, featured, sort order, show or hide. |
| **The Sacred Thought** | People stories, journal posts, *Minutes with the MD* episodes (paste a YouTube link) and press coverage (paste the article link). |
| **Home page → Page text and images** | Every headline, paragraph and photo on the home page, section by section: hero headline and slideshow, numbers, story timeline, brand cards, How it's made steps, MD feature, Pushkar band, the Built across India band, and the products page header. Leave a field empty to keep the current text. |
| **Home page → Leadership, Awards, Diwali kit offer** | Names, roles, photos and bios; the awards list; the countdown date, order link and offer bar on or off. |

**Adding a product:** Products → New Product → fill it in → add photos → Save. The first photo is the one on the card; phone photos are fine because they are resized and converted to WebP as they upload. Turn on *Packshot on a white background* for product-on-white photos so the whole pack shows.

**Adding a story:** The Sacred Thought → New Story → choose the kind (People, Journal, Minutes with the MD, In the media) → write → Save. Tick *Draft* to keep it off the site until it is ready. The home page always shows the newest three stories, the newest MD episodes and the latest press.

## The shop

Customers add products to the cart (kept in their browser), check out with their address, and pay online through **PhonePe**
(UPI, cards, netbanking, wallets) or choose **cash on delivery**. Every price is checked again on the server, so nobody can change what they pay.

| Where | What |
| --- | --- |
| `/product/<name>.html` | One page per product, with photos, packs, Add to cart and Buy now. Built from the admin. |
| `/checkout.html` | Address, pincode, payment choice. |
| `/order.html` | The confirmation page the customer comes back to after paying. |
| `/admin/orders.html` | **Your orders.** New orders to pack and ship, payment status, add the courier and tracking number (the customer is emailed), print a packing slip, download a CSV for Shiprocket or accounts. |
| Admin → Home page → **Shop settings** | Delivery charge, free delivery amount, cash on delivery on/off, COD charge and limit, contact numbers. |
| Admin → **Help pages** | Shipping, returns, terms, privacy, contact. |

### Switching the shop on (Netlify → Site configuration → Environment variables)

| Variable | What to put |
| --- | --- |
| `ORDERS_PASSWORD` | A strong password for `/admin/orders.html`. **Needed for the orders screen.** |
| `PHONEPE_CLIENT_ID`, `PHONEPE_CLIENT_SECRET`, `PHONEPE_CLIENT_VERSION` | From the PhonePe Business dashboard → Developer settings → API keys (Standard Checkout, v2). |
| `PHONEPE_ENV` | `sandbox` to test with PhonePe's test keys, `production` to take real money. |
| `PHONEPE_WEBHOOK_USER`, `PHONEPE_WEBHOOK_PASSWORD` | In the PhonePe dashboard, add a webhook to `https://tirangaagarbatti.com/api/phonepe-webhook` with a username and password of your choice, and put the same two here. It confirms payments even if the customer closes the tab. |
| `RESEND_API_KEY`, `MAIL_FROM` | Optional, for emails: sign up at resend.com (it has a free plan), verify the domain, and set `MAIL_FROM` to e.g. `Tiranga Agarbatti <orders@tirangaagarbatti.com>`. New orders are emailed to the address in Shop settings, customers get a confirmation and a shipped email. |
| `ORDER_EMAIL` | Optional: send new-order emails somewhere other than the Shop settings address. |

Without the PhonePe keys the checkout offers cash on delivery only. Orders are stored in Netlify Blobs (comes with the site; nothing to set up).

### Before taking real orders

1. Place a test order with `PHONEPE_ENV=sandbox`, and one cash-on-delivery order. Check both on `/admin/orders.html`.
2. Read the Help pages and adjust the delivery times, charges and returns window to what you actually do.
3. Switch `PHONEPE_ENV` to `production` and redeploy.
4. Point the domain `tirangaagarbatti.com` at Netlify (Domain management). Old store links (`/product/...`, `/shop`, `/cart`, the policy pages) forward to the new pages through `_redirects`.

## Who can sign in

Anyone with write access to this GitHub repo (GitHub → the repo → Settings → Collaborators). There are two ways to sign in:

1. **Sign in with GitHub** (recommended, one-time setup):
   - On GitHub: Settings → Developer settings → OAuth Apps → New OAuth App.
     Homepage URL: your site address. Authorization callback URL: `https://api.netlify.com/auth/done`.
     Create it, then generate a client secret.
   - On Netlify: open the site's configuration → Access & security → OAuth → Install provider → GitHub, and paste the Client ID and Client secret.
2. **Sign in using access token** (works straight away): GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate. Give it access to this repo only, with *Contents: Read and write*. Paste the token on the admin sign-in screen.

## Going live (first time)

1. **Netlify** → Add new site → Import an existing project → GitHub → choose this repo. The build settings are read from `netlify.toml` (`npm run build`, publish `dist`), so just press Deploy.
2. **Domain:** the site is set up for `https://tirangaagarbatti.com`. If it lives elsewhere, change that address in `scripts/lib.mjs` (one line), `robots.txt`, `admin/config.yml` and the `canonical` / `og:` tags at the top of `index.html`, `products.html` and `selections.html`. Then add the domain in Netlify under Domain management.
3. **Sign-in:** set up one of the options above.
4. **Bring over the old store's products (one time):** on a computer with Node 20+, while the old store is still online:
   ```
   npm install
   npm run import:woocommerce                       # reads the live tirangaagarbatti.com store
   npm run import:woocommerce -- --csv export.csv   # or a WooCommerce "Products > Export" CSV
   ```
   This writes one file per product into `content/products/` with prices, MRPs, packs, stock and the old link, and downloads all the photos into `uploads/products/`. Check them, then commit and push. From then on, edit products in the admin.

## For developers

| Path | What it is |
| --- | --- |
| `index.html`, `products.html`, `selections.html`, `404.html` | Page templates. Plain HTML; `<!-- build:name -->` markers are filled in by the build. |
| `styles.css`, `site.js`, `products.js` | Shared styles and behaviour (GSAP from cdnjs for scroll scenes). |
| `brand/` | Fixed site photography. |
| `uploads/` | Photos uploaded from the admin. |
| `content/products/*.json` | One file per product (written by the admin). |
| `content/stories/*.md` | One file per story, Markdown with a YAML header. Files starting with `_` are templates and never published. |
| `content/site/home.json` | Page text and images. In the HTML, editable spots carry `data-cms="section.field"` (text), `data-cms-src` (image), `data-cms-alt` and `data-cms-href`; lists such as the hero slides are rebuilt by `scripts/build-pages.mjs`. |
| `content/site/*.json` | Leadership, awards, Diwali offer. |
| `admin/` | The admin ([Sveltia CMS](https://github.com/sveltia/sveltia-cms)) and its `config.yml`. |
| `scripts/build.mjs` | Builds everything into `dist/`. Source files are never modified. |
| `scripts/import-woocommerce.mjs` | One-time product import from WooCommerce. |
| `cart.js`, `checkout.js` | The cart drawer, product pages, checkout and order confirmation. |
| `netlify/functions/` | Server code: `checkout` (prices the order, starts PhonePe), `order` (confirmation page), `phonepe-webhook`, `admin-orders`. Shared code in `netlify/lib/`. |
| `content/site/shop.json`, `content/pages/*.md` | Shop settings and help pages. |
| `redirects.txt` | Old store links → new pages (the build adds one line per product). |

```
npm install
npm run preview      # builds dist/ and serves it at http://localhost:3000 (no checkout)
npx netlify dev      # the full shop locally, with the functions (needs the Netlify CLI)
```

The admin needs HTTPS or `localhost`, and it saves to the `main` branch of the repo named in `admin/config.yml`.
