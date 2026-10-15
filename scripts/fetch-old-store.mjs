#!/usr/bin/env node
/**
 * Copies the product photos from the old store (tirangaagarbatti.com, public WooCommerce Store API, no keys)
 * onto the matching products in content/products/, matched by their "Old store link".
 *
 *   node scripts/fetch-old-store.mjs            (needs sharp: npm install --no-save sharp)
 *
 * - Photos are resized to at most 1200 px and saved as WebP in uploads/products/<product>.webp, -2.webp, …
 * - Products that already have photos are left alone, so photos added in the admin are never replaced.
 * - The old store's own product data (descriptions, categories, attributes) is saved to
 *   content/import/old-store.json for reference.
 * Run by .github/workflows/old-store-photos.yml, which commits the result.
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const STORE = (process.env.STORE_URL || "https://tirangaagarbatti.com").replace(/\/$/, "");
const DIR = join(ROOT, "content", "products");
const UP = join(ROOT, "uploads", "products");
const MAX_PHOTOS = 5;
const UA = "Mozilla/5.0 (compatible; MKD-site-migration/1.0; +https://tirangaagarbatti.com)";

const sharp = (await import("sharp")).default;
const path = (u) => { try { return new URL(u, STORE).pathname.replace(/\/?$/, "/").toLowerCase(); } catch { return ""; } };
const strip = (html = "") => html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#8217;|&rsquo;/g, "'")
  .replace(/&#8211;|&ndash;/g, "–").replace(/&#8220;|&#8221;/g, '"').replace(/&#[0-9]+;/g, " ").replace(/\s+/g, " ").trim();

async function get(url, tries = 3) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "*/*" } });
      if (res.ok) return res;
      if (i >= tries || res.status < 500) throw new Error(`HTTP ${res.status}`);
    } catch (e) { if (i >= tries) throw e; }
    await new Promise((r) => setTimeout(r, 1500 * i));
  }
}

// 1. the old catalogue
const store = [];
for (let page = 1; page < 30; page++) {
  const res = await get(`${STORE}/wp-json/wc/store/v1/products?per_page=100&page=${page}&orderby=id&order=asc`);
  const batch = await res.json();
  store.push(...batch);
  const pages = +res.headers.get("x-wp-totalpages") || 0;
  if (batch.length < 100 || (pages && page >= pages)) break;
}
console.log(`Old store: ${store.length} products`);
mkdirSync(join(ROOT, "content", "import"), { recursive: true });
writeFileSync(join(ROOT, "content", "import", "old-store.json"), JSON.stringify(store.map((p) => ({
  id: p.id, name: strip(p.name), permalink: p.permalink, type: p.type,
  short_description: strip(p.short_description), description: strip(p.description),
  categories: (p.categories || []).map((c) => c.name), tags: (p.tags || []).map((t) => t.name),
  attributes: (p.attributes || []).map((a) => ({ name: a.name, terms: (a.terms || []).map((t) => t.name) })),
  images: (p.images || []).map((i) => ({ src: i.src, alt: i.alt || "", name: i.name || "" })),
})), null, 2) + "\n");
const byPath = new Map(store.map((p) => [path(p.permalink), p]));

// 2. photos onto the matching products
mkdirSync(UP, { recursive: true });
const files = readdirSync(DIR).filter((f) => f.endsWith(".json")).sort();
let matched = 0, photos = 0;
const unmatched = [], failed = [];
const queue = [];
for (const f of files) {
  const doc = JSON.parse(readFileSync(join(DIR, f), "utf8"));
  if (!doc.old_url) continue;
  const p = byPath.get(path(doc.old_url));
  if (!p) { unmatched.push(`${f} (${doc.old_url})`); continue; }
  matched++;
  if (Array.isArray(doc.images) && doc.images.length) continue;
  queue.push({ f, doc, p });
}

async function photosFor({ f, doc, p }) {
  const id = f.replace(/\.json$/, "");
  const seen = new Set(), saved = [];
  for (const img of (p.images || [])) {
    if (saved.length >= MAX_PHOTOS) break;
    if (!img.src || seen.has(img.src)) continue;
    seen.add(img.src);
    const name = saved.length ? `${id}-${saved.length + 1}.webp` : `${id}.webp`;
    try {
      if (!existsSync(join(UP, name))) {
        const buf = Buffer.from(await (await get(img.src)).arrayBuffer());
        await sharp(buf).rotate().resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true })
          .webp({ quality: 82 }).toFile(join(UP, name));
      }
      saved.push(`/uploads/products/${name}`);
    } catch (e) { failed.push(`${id}: ${img.src} (${e.message})`); }
  }
  if (saved.length) {
    doc.images = saved;
    writeFileSync(join(DIR, f), JSON.stringify(doc, null, 2) + "\n");
    photos += saved.length;
  }
  return saved.length;
}

const noPhotos = [];
const workers = Array.from({ length: 6 }, async () => {
  while (queue.length) {
    const job = queue.shift();
    if (!(await photosFor(job))) noPhotos.push(job.f);
  }
});
await Promise.all(workers);

console.log(`Matched ${matched} of ${files.length} products to the old store; saved ${photos} photos.`);
if (noPhotos.length) console.log(`\nNo photo on the old store for:\n  ${noPhotos.sort().join("\n  ")}`);
if (unmatched.length) console.log(`\nNot found on the old store:\n  ${unmatched.join("\n  ")}`);
if (failed.length) console.log(`\nPhotos that could not be downloaded:\n  ${failed.join("\n  ")}`);
