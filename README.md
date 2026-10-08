# Maa Kamakhya Darbar Fragrances: website

The corporate site for Tiranga, Sacred and Sacred Selections, with its own admin at **/admin**.
No WordPress, no database and no monthly fees: everything lives in this GitHub repo, and Netlify publishes it.

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
2. **Domain:** the site is set up for `https://www.mkdtiranga.com`. If it lives elsewhere, change that address in `scripts/lib.mjs` (one line), `robots.txt`, `admin/config.yml` and the `canonical` / `og:` tags at the top of `index.html`, `products.html` and `selections.html`. Then add the domain in Netlify under Domain management.
3. **Sign-in:** set up one of the options above.
4. **Bring over the old products (optional, one time):** on a computer with Node 20+:
   ```
   npm install
   npm run import:woocommerce                       # reads the live tirangaagarbatti.com store
   npm run import:woocommerce -- --csv export.csv   # or a WooCommerce "Products > Export" CSV
   ```
   This writes one file per product into `content/products/` and downloads the photos into `uploads/products/`. Check them, then commit and push. From then on, edit products in the admin.

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

```
npm install
npm run preview      # builds dist/ and serves it at http://localhost:3000
```

The admin needs HTTPS or `localhost`, and it saves to the `main` branch of the repo named in `admin/config.yml`.
