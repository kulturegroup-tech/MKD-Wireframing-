#!/usr/bin/env node
/**
 * One-time import: copies the WooCommerce catalogue (tirangaagarbatti.com) into the new shop,
 * as one file per product in content/products/, with the photos downloaded into uploads/products/.
 * Prices, MRPs, packs/sizes (variable products), stock and the old product links all come across,
 * so the old links forward to the new pages. After this, products are managed in the admin (/admin).
 *
 *   npm run import:woocommerce                          from the live store (public Store API, no keys)
 *   npm run import:woocommerce -- --csv export.csv      from a WooCommerce "Products > Export" CSV
 *   add --overwrite to replace products that already exist in content/products/
 *
 * Run it on your own computer, check the files, then commit and push.
 */
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const STORE = (process.env.STORE_URL || "https://tirangaagarbatti.com").replace(/\/$/, "");
const OVERWRITE = process.argv.includes("--overwrite");

/* ---- Which store categories go where in the new shop. ----
   A product is placed in the first group whose keywords match one of its store
   category slugs or names. Products that match nothing (for example detergent) are left out. Edit freely. */
const GROUPS = [
  { slug: "kits",       name: "Poojan kits",       hindi: "पूजन किट", match: ["kit"] },
  { slug: "havan-cup",  name: "Havan cup dhoop",   hindi: "हवन कप",   match: ["havan"] },
  { slug: "gulab-jal",  name: "Gulab jal",         hindi: "गुलाब जल", match: ["gulab-jal", "gulab jal", "rose water"] },
  { slug: "wet-dhoop",  name: "Wet dhoop",         hindi: "गीली धूप", match: ["wet-dhoop", "wet dhoop"] },
  { slug: "dhoop-cone", name: "Dhoop cones",       hindi: "धूप कोन",  match: ["dhoop-cone", "dhoop cone", "cone"] },
  { slug: "bambooless", name: "Bambooless sticks", hindi: "बिना बाँस", match: ["bambooless", "bamboo-less", "bamboo less"] },
  { slug: "jar",        name: "Jar packs",         hindi: "धूप जार",  match: ["jar"] },
  { slug: "dhoopbatti", name: "Dhoopbatti",        hindi: "धूपबत्ती", match: ["dhoop-stick", "dhoop stick", "dhoopbatti", "box-pack", "box pack"] },
  { slug: "agarbatti",  name: "Agarbatti",         hindi: "अगरबत्ती", match: ["agarbatti", "incense"] },
];

/* Hindi display names, used when a product has no "Hindi name" attribute in WooCommerce. Longest match wins. */
const HINDI = {
  "mysore chandan": "मैसूर चन्दन", "kesar chandan": "केसर चंदन", "nag champa": "नाग चम्पा", "great van": "ग्रेट वन",
  "gainda": "गेंदा फूल", "marigold": "गेंदा फूल", "chandan": "चंदन", "sandal": "संडल", "mogra": "मोगरा", "jasmine": "चमेली",
  "gulab": "गुलाब", "rose": "गुलाब", "ziyarat": "ज़ियारत", "loban": "लोबान", "guggal": "गुग्गल", "kapoor": "कपूर", "camphor": "कपूर",
  "kewda": "केवड़ा", "khus": "खस", "tulsi": "तुलसी", "champa": "चम्पा", "rajnigandha": "रजनीगंधा", "lavender": "लैवेंडर",
  "karishma": "करिश्मा", "diwali": "दीपावली पूजन किट", "holi": "होली किट", "havan": "हवन",
};
const BRAND_HINDI = { "Tiranga": "तिरंगा", "Sacred": "सेकरेड", "Sacred Selections": null };

const strip = (html = "") => html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#8217;|&rsquo;/g, "'").replace(/&#8211;|&ndash;/g, "-").replace(/\s+/g, " ").trim();
const clip = (s, n = 220) => (s.length > n ? s.slice(0, s.lastIndexOf(" ", n)) + "…" : s);

function groupFor(cats) {
  const hay = cats.map((c) => `${c.slug || ""} ${c.name || ""}`.toLowerCase());
  return GROUPS.find((g) => g.match.some((k) => hay.some((h) => h.includes(k))));
}
function brandFor(name, extra = []) {
  const t = (name + " " + extra.join(" ")).toLowerCase();
  if (t.includes("selection")) return "Sacred Selections";
  if (t.includes("sacred")) return "Sacred";
  return "Tiranga";
}
function hindiFor(name, attrs = [], brand = "Tiranga") {
  const a = attrs.find((x) => /hindi/i.test(x.name || ""));
  if (a) return (a.terms?.[0]?.name || a.value || "").trim() || null;
  const n = name.toLowerCase();
  const key = Object.keys(HINDI).sort((x, y) => y.length - x.length).find((k) => n.includes(k));
  return key ? HINDI[key] : BRAND_HINDI[brand] ?? null;
}
function sizeFor(name) {
  const m = name.match(/\b(\d+(?:\.\d+)?\s?(?:g|gm|gms|grams?|kg|sticks?|pcs|pieces|cups?))\b/i);
  return m ? m[1] : "";
}
function bestSrc(img) {
  if (!img) return null;
  if (img.srcset) {
    const opts = img.srcset.split(",").map((s) => s.trim().split(/\s+/)).map(([u, w]) => ({ u, w: parseInt(w, 10) || 0 }));
    const pick = opts.filter((o) => o.w >= 600).sort((a, b) => a.w - b.w)[0] || opts.sort((a, b) => b.w - a.w)[0];
    if (pick) return pick.u;
  }
  return img.src || null;
}

/* ---------------- live Store API ---------------- */
async function fromStoreApi() {
  const out = [];
  for (let page = 1; page < 50; page++) {
    const url = `${STORE}/wp-json/wc/store/v1/products?per_page=100&page=${page}`;
    const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "mkd-site-sync/1.0" } });
    if (!res.ok) throw new Error(`Store API ${res.status} on page ${page}`);
    const batch = await res.json();
    out.push(...batch);
    const pages = parseInt(res.headers.get("x-wp-totalpages") || "0", 10);
    if (batch.length < 100 || (pages && page >= pages)) break;
  }
  const money = (prices, key) => {
    const v = prices?.[key];
    return v === undefined || v === null || v === "" ? null : parseInt(v, 10) / 10 ** (prices?.currency_minor_unit ?? 2);
  };
  const result = [];
  for (const p of out) {
    const price = money(p.prices, "price"), regular = money(p.prices, "regular_price");
    // variable products: each pack has its own price, fetched one by one
    const variants = [];
    if (p.type === "variable" && Array.isArray(p.variations)) {
      for (const v of p.variations.slice(0, 20)) {
        try {
          const r = await fetch(`${STORE}/wp-json/wc/store/v1/products/${v.id}`, { headers: { Accept: "application/json" } });
          if (!r.ok) continue;
          const d = await r.json();
          const label = (v.attributes || d.variation?.attributes || []).map((a) => a.value || a.name).filter(Boolean).join(" / ") || strip(d.name);
          const vp = money(d.prices, "price"), vr = money(d.prices, "regular_price");
          if (vp) variants.push({ label, price: vp, mrp: vr && vr > vp ? vr : null, in_stock: d.is_in_stock !== false });
        } catch { /* skip that pack */ }
      }
    }
    result.push({
      variants,
      images: (p.images || []).map(bestSrc).filter(Boolean),
      wcId: p.id,
      name: strip(p.name),
      cats: p.categories || [],
      tags: (p.tags || []).map((t) => t.slug || t.name),
      attrs: p.attributes || [],
      description: strip(p.short_description) || strip(p.description),
      price: price != null ? { amount: price, regular: regular && regular > price ? regular : null, currency: p.prices?.currency_code || "INR", from: p.type === "variable" } : null,
      url: p.permalink,
      inStock: p.is_in_stock !== false,
      featured: false,
    });
  }
  return result;
}

/* ---------------- WooCommerce CSV export ---------------- */
function parseCsv(text) {
  const rows = []; let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const head = rows.shift().map((h) => h.replace(/^﻿/, "").trim());
  return rows.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}
async function fromCsv(file) {
  const rows = parseCsv(await readFile(file, "utf8"));
  const variations = {};
  for (const r of rows) if (r.Type === "variation" && r.Parent) {
    const parent = r.Parent.replace(/^id:/, "");
    const p = parseFloat(r["Sale price"] || r["Regular price"]);
    const label = [1, 2, 3].map((i) => r[`Attribute ${i} value(s)`]).filter(Boolean).join(" / ") || strip(r.Name);
    if (!isNaN(p)) (variations[parent] ||= []).push({ p, reg: parseFloat(r["Regular price"]) || null, label, stock: r["In stock?"] !== "0" });
  }
  return rows
    .filter((r) => r.Type !== "variation" && r.Published === "1" && r["Visibility in catalog"] !== "hidden")
    .map((r) => {
      const cats = (r.Categories || "").split(",").flatMap((c) => c.split(">")).map((c) => c.trim()).filter(Boolean)
        .map((n) => ({ name: n, slug: n.toLowerCase().replace(/[^a-z0-9]+/g, "-") }));
      const attrs = [];
      for (let i = 1; i < 10; i++) if (r[`Attribute ${i} name`]) attrs.push({ name: r[`Attribute ${i} name`], value: r[`Attribute ${i} value(s)`] });
      let amount = parseFloat(r["Sale price"] || r["Regular price"]);
      let regular = parseFloat(r["Regular price"]) || null;
      let from = false;
      if (isNaN(amount) && variations[r.ID]) { const v = variations[r.ID].sort((a, b) => a.p - b.p)[0]; amount = v.p; regular = v.reg; from = variations[r.ID].length > 1; }
      return {
        wcId: r.ID, name: strip(r.Name), cats, tags: (r.Tags || "").split(",").map((t) => t.trim().toLowerCase()),
        attrs, description: strip(r["Short description"]) || strip(r.Description),
        price: isNaN(amount) ? null : { amount, regular: regular && regular > amount ? regular : null, currency: "INR", from },
        variants: (variations[r.ID] || []).map((v) => ({ label: v.label, price: v.p, mrp: v.reg && v.reg > v.p ? v.reg : null, in_stock: v.stock })),
        images: (r.Images || "").split(",").map((x) => x.trim()).filter(Boolean),
        url: r["Slug"] ? `${STORE}/product/${r.Slug}/` : "",
        inStock: r["In stock?"] !== "0",
        featured: r["Is featured?"] === "1",
      };
    });
}

/* ---------------- write one admin file per product ---------------- */
async function exists(p) { try { await access(p); return true; } catch { return false; } }
const slugify = (s) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);

async function download(url, slug) {
  const ext = ((extname(new URL(url).pathname) || ".jpg").toLowerCase().match(/^\.(jpe?g|png|webp|gif)$/) || [".jpg"])[0];
  const rel = `/uploads/products/${slug}${ext}`;
  if (!(await exists(join(ROOT, rel)))) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`photo ${res.status}`);
    await writeFile(join(ROOT, rel), Buffer.from(await res.arrayBuffer()));
  }
  return rel;
}

async function main() {
  const csvIdx = process.argv.indexOf("--csv");
  const raw = csvIdx > -1 ? await fromCsv(process.argv[csvIdx + 1]) : await fromStoreApi();
  await mkdir(join(ROOT, "content", "products"), { recursive: true });
  await mkdir(join(ROOT, "uploads", "products"), { recursive: true });

  let written = 0, kept = 0, skipped = 0, order = 10;
  for (const p of raw) {
    const g = groupFor(p.cats);
    if (!g) { skipped++; continue; }
    const brand = brandFor(p.name, [...p.tags, ...p.cats.map((c) => c.slug)]);
    const slug = slugify(p.name) || `product-${p.wcId}`;
    const file = join(ROOT, "content", "products", `${slug}.json`);
    if (!OVERWRITE && (await exists(file))) { kept++; continue; }
    const images = [];
    for (const [i, url] of p.images.slice(0, 8).entries()) {
      try { images.push(await download(url, i ? `${slug}-${i + 1}` : slug)); }
      catch (e) { console.warn(`  ${p.name}: ${e.message}, a photo was left out`); }
    }
    const doc = {
      name: p.name,
      brand,
      category: g.slug,
      images,
      packshot: images.length > 0,
      hindi: hindiFor(p.name, p.attrs, brand) || "",
      format: [g.name.replace(/s$/, ""), sizeFor(p.name)].filter(Boolean).join(", "),
      description: clip(p.description || "", 400),
      price: p.variants.length > 1 ? null : p.variants[0]?.price ?? p.price?.amount ?? null,
      mrp: p.variants.length > 1 ? null : p.variants[0]?.mrp ?? p.price?.regular ?? null,
      price_from: false,
      variants: p.variants.length > 1 ? p.variants : [],
      in_stock: p.inStock !== false,
      old_url: p.url || "",
      featured: !!p.featured || g.slug === "kits",
      order: (order += 10),
      published: true,
    };
    await writeFile(file, JSON.stringify(doc, null, 2) + "\n");
    written++;
  }
  console.log(`Imported ${written} products into content/products/ (${kept} already there, ${skipped} not in a site category).`);
  console.log("Out-of-stock products show as Sold out; switch In stock back on in the admin when they are back.");
}

main().catch((e) => { console.error(`Import failed: ${e.message}`); process.exit(1); });
