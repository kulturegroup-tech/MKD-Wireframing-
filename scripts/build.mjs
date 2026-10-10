#!/usr/bin/env node
/* Builds the live site into dist/. Netlify runs this on every change saved in the admin.
 *   npm run build      (or: node scripts/build.mjs)
 * Your source files are never modified; everything generated lands in dist/. */
import { rmSync, mkdirSync, cpSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, DIST, DOMAIN } from "./lib.mjs";
import { buildProducts } from "./build-products.mjs";
import { buildPages } from "./build-pages.mjs";
import { buildStories } from "./build-stories.mjs";
import { buildSite } from "./build-site.mjs";
import { buildShopPages } from "./build-shop-pages.mjs";
import { readProducts } from "./build-products.mjs";

const COPY = [
  "index.html", "products.html", "selections.html", "404.html",
  "styles.css", "site.js", "products.js", "cart.js", "checkout.js",
  "favicon.svg", "favicon-32.png", "apple-touch-icon.png", "icon-512.png", "robots.txt",
  "brand", "uploads", "admin",
];

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });
for (const item of COPY) {
  if (existsSync(join(ROOT, item))) cpSync(join(ROOT, item), join(DIST, item), { recursive: true, filter: (src) => !src.endsWith(".gitkeep") });
}

const fields = buildPages();      // page text and images first, so later steps work on the final pages
const products = buildProducts();
const helpPages = buildShopPages();
const stories = buildStories();
const site = buildSite();          // last, so it also reaches the story pages

const urls = ["/", "/products.html", "/selections.html", "/stories.html"]
  .concat(readProducts().map((p) => `/${p.url}`))
  .concat(helpPages.map((p) => `/${p}.html`))
  .concat(stories.filter((s) => !s.link).map((s) => `/stories/${s.slug}.html`));
writeFileSync(join(DIST, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${DOMAIN}${u}</loc></url>`).join("\n")}
</urlset>
`);

console.log(`Built dist/: ${fields} editable text and image spots, ${products} products (with pages), ${helpPages.length} help pages, ${stories.length} stories, ${site.leaders} leaders, ${site.awards} awards.`);
