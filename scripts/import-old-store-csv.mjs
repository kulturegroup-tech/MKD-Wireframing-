#!/usr/bin/env node
/**
 * One-time import of the old store's published catalogue (content/import/old-store-products.csv,
 * read from tirangaagarbatti.com's public product feed in October 2026) into content/products/.
 *
 *   node scripts/import-old-store-csv.mjs
 *
 * Prices, MRPs, packs and sizes, stock and the old product links come from the CSV.
 * Photos come separately (scripts/fetch-old-store.mjs, run by GitHub Actions).
 * Products already in content/products/ with the same old link keep their name, photos and text;
 * only their prices, packs and stock are updated. Detergent is left out (not part of the new shop).
 */
import { readFileSync, writeFileSync, readdirSync, unlinkSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = join(ROOT, "content", "products");
const CSV = join(ROOT, "content", "import", "old-store-products.csv");

/* placeholder products from the first version of the shop, replaced by the real catalogue */
const PLACEHOLDERS = [
  "sacred-chandan-dhoop-jar", "sacred-gainda-phool-premium-agarbatti", "sacred-great-van-premium-agarbatti",
  "sacred-gulab-premium-dhoopbatti", "sacred-karishma-premium-incense-sticks", "sacred-mysore-chandan-premium-agarbatti",
  "sacred-sandal-premium-dhoopbatti", "tiranga-agarbatti", "tiranga-chandan-premium-incense-sticks",
  "tiranga-mogra-premium-agarbatti", "tiranga-ziyarat-premium-agarbatti",
];

/* names that need tidying on the new site (typos, capitals, old-store shorthand) */
const RENAME = {
  8093: "Sacred Ekta Havan Cup (6 Cups)",
  8090: "Tiranga Havan Cup (6 Cups)",
  7873: "Holi Essentials Poojan & Celebration Kit",
  5229: "Asim Loban Premium Incense Sticks (Pack of 12)",
  5226: "Vijeta Premium Incense Sticks (Pack of 12)",
  5223: "Karishma Premium Incense Sticks (Pack of 12)",
  5220: "Ekta Premium Incense Sticks (Pack of 12)",
  5218: "Tiranga Gulab Incense Sticks (Pack of 12)",
  5217: "Tiranga Sandal Incense Sticks (Pack of 12)",
  5175: "Tiranga Ziyarat Incense Sticks (Pack of 12)",
  5174: "Tiranga Rajnigandha Incense Sticks (Pack of 12)",
  4768: "Assorted Dhoop Sticks Jars (Wholesale Pack)",
  4759: "Slim Trim Premium Incense Sticks (Wholesale Pack)",
  4754: "Slim Trim VIP Incense Sticks (Wholesale Pack)",
  1422: "Assorted Dhoop Sticks, 12 Fragrances (Jhola of 12 Dozen)",
  5769: "Tiranga Loban Cup (Pack of 72)",
  397: "Sacred Genda Phool Incense Sticks (18 Gram)",
  262: "Sacred Great One Incense Sticks Eco Pack (100 Gram)",
  4808: "Sacred Siddhi Gugal Dhoop Zipper",
  665: "Sacred Sai Shraddha Premium Dhoop Sticks (10 Sticks)",
  767: "Sacred Great One Slim Trim Premium Incense Sticks",
};

/* brand for the products whose name doesn't say it (checked against the old store's pages by fetch-old-store.mjs) */
const BRAND_BY_ID = {
  5229: "Tiranga", 5226: "Sacred", 5223: "Sacred", 5220: "Sacred", 5218: "Tiranga", 5217: "Tiranga",
  4768: "Sacred", 4759: "Sacred", 4754: "Sacred", 1422: "Sacred", 7873: "Sacred", 4867: "Tiranga",
  807: "Tiranga", 237: "Tiranga", 233: "Tiranga", 5042: "Tiranga", 5037: "Tiranga", 5031: "Tiranga",
};
const BRAND_BY_CATEGORY = { "dhoop-cone": "Sacred", bambooless: "Sacred" };

const BULK = new Set([5229, 5226, 5223, 5220, 5218, 5217, 5175, 5174, 4768, 4759, 4754, 1422, 5769, 5250]);

/* Hindi display names: the fragrance in the product name (longest match wins), else the kind of product. */
const HINDI = {
  "mysore chandan": "मैसूर चंदन", "mahakal chandan": "महाकाल चंदन", "kesar kevda": "केसर केवड़ा",
  "phool champa": "फूल चम्पा", "genda phool": "गेंदा फूल", "sai shraddha": "साईं श्रद्धा", "siddhi gugal": "सिद्धि गुग्गल",
  "siddhi guggal": "सिद्धि गुग्गल", "asim loban": "असीम लोबान", "great one": "ग्रेट वन", "vrindavan flora": "वृंदावन फ्लोरा",
  "baba flora": "बाबा फ्लोरा", "braj vasi": "ब्रजवासी", "green wood": "ग्रीनवुड", "greenwood": "ग्रीनवुड", "sandal wood": "संदल",
  "archana sambrani": "अर्चना साम्ब्रानी", "3 in 1": "तिरंगा 3 इन 1", "gulab jal": "गुलाब जल", "holi": "होली पूजन किट",
  chandan: "चंदन", sandal: "संदल", mogra: "मोगरा", gulab: "गुलाब", ziyarat: "ज़ियारत", rajnigandha: "रजनीगंधा",
  lavender: "लैवेंडर", karishma: "करिश्मा", vijeta: "विजेता", prasang: "प्रसंग", ekta: "एकता", archana: "अर्चना",
  aroma: "अरोमा", fantasia: "फैंटेसिया", confidence: "कॉन्फिडेंस", jasmine: "जैस्मिन", pineapple: "पाइनएप्पल",
  gugal: "गुग्गल", loban: "लोबान", kasturi: "कस्तूरी", chameli: "चमेली", heena: "हिना", firdous: "फ़िरदौस",
  pakiza: "पाकीज़ा", mehbooba: "महबूबा", mahbooba: "महबूबा", agarwood: "अगरवुड", saavi: "सावी", rajas: "राजस",
  saugaat: "सौगात", bhor: "भोर", gerua: "गेरुआ", sraddha: "श्रद्धा",
};
/* names where "Tiranga" is the fragrance itself, checked before the brand word is set aside */
const HINDI_TIRANGA = { "tiranga silver": "तिरंगा सिल्वर", "tiranga ekta": "तिरंगा एकता" };
const CAT_HINDI = { agarbatti: "अगरबत्ती", bambooless: "बिना बाँस अगरबत्ती", dhoopbatti: "धूपबत्ती", "dhoop-cone": "धूप कोन",
  "wet-dhoop": "गीली धूप", "havan-cup": "हवन कप", jar: "धूप जार", "gulab-jal": "गुलाब जल", "puja-essentials": "पूजा सामग्री",
  kits: "पूजन किट", bulk: "थोक पैक" };

/* ---- CSV ---- */
function parseCsv(text) {
  const rows = []; let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (c === '"') q = false; else field += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(field); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const head = rows.shift().map((h) => h.replace(/^﻿/, "").trim());
  return rows.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? "").trim()])));
}
const money = (s) => { const m = String(s).replace(/,/g, "").match(/₹\s*([\d.]+)/); return m ? +m[1] : null; };
const slugify = (s) => s.toLowerCase().replace(/&/g, " and ").normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 90);
const tidy = (s) => s.replace(/\s+/g, " ").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")").replace(/\)\s*\+\s*/g, ") + ").trim();

function variantsFrom(text) {
  if (!text || text === "—") return [];
  return text.split(";").map((part) => {
    const m = part.match(/^\s*(.+?):\s*₹\s*([\d,.]+)\s*\((in stock|out of stock)\)/i);
    return m ? { label: m[1].trim(), price: +m[2].replace(/,/g, ""), mrp: null, in_stock: /^in/i.test(m[3]) } : null;
  }).filter(Boolean);
}

function categoryFor(id, name, cats) {
  const has = (c) => cats.includes(c);
  if (has("detergent")) return null;
  if (BULK.has(id)) return "bulk";
  if (has("poojan kit")) return "kits";
  if (has("pooja essentials")) return "puja-essentials";
  if (has("gulab jal")) return "gulab-jal";
  if (has("havan cup")) return "havan-cup";
  if (has("wet dhoop") || has("wet dhoop collection")) return "wet-dhoop";
  if (has("dhoop cone")) return "dhoop-cone";
  if (has("bambooless sticks")) return "bambooless";
  if (/\bjar\b/i.test(name)) return "jar";
  if (has("dhoop sticks")) return "dhoopbatti";
  return "agarbatti";
}

function brandFor(id, name, category) {
  const n = name.toLowerCase();
  if (BRAND_BY_ID[id]) return BRAND_BY_ID[id];
  if (/^sacred\b/.test(n) || /\bsacred\b/.test(n)) return "Sacred";
  if (/\btiranga\b/.test(n)) return "Tiranga";
  return BRAND_BY_CATEGORY[category] || "Tiranga";
}

function hindiFor(name, category) {
  const n = name.toLowerCase().replace(/kewda/g, "kevda").replace(/greatone/g, "great one");
  const longest = (map, text) => Object.keys(map).sort((a, b) => b.length - a.length).find((k) => text.includes(k));
  let k = longest(HINDI_TIRANGA, n);
  if (k) return HINDI_TIRANGA[k];
  k = longest(HINDI, n.replace(/^(sacred|tiranga)\s+/, ""));
  if (k) return HINDI[k];
  if (/\btiranga\b/.test(n)) return "तिरंगा";
  if (/slim trim/.test(n)) return "स्लिम ट्रिम";
  return CAT_HINDI[category] || "";
}

/* "Pack and size" line on the card and product page */
function formatFor(id, name, category, cats, variants) {
  const n = name.toLowerCase();
  const grams = (n.match(/\((\d+)\s*gram\)/) || [])[1];
  const sticks = (n.match(/\((\d+)\s*sticks\)/) || [])[1];
  const cups = (n.match(/\((\d+)\s*cups\)/) || [])[1];
  const sizes = variants.length ? variants.map((v) => v.label).join(" or ") : "";
  const has = (c) => cats.includes(c);
  switch (category) {
    case "kits": return "Poojan and celebration kit";
    case "puja-essentials": return sizes ? `Puja ghee, ${sizes} jars` : "Puja essentials";
    case "gulab-jal": return "Gulab jal (rose water)";
    case "havan-cup": return cups ? `Havan cups, box of ${cups}` : "Havan cups";
    case "dhoop-cone": return "Premium dhoop cones";
    case "bambooless": return "Bambooless incense sticks";
    case "jar": return grams ? `Premium dhoop sticks, ${grams} g jar` : "Premium dhoop sticks, jar";
    case "dhoopbatti": return sticks ? `Premium dhoop sticks, box of ${sticks}` : "Premium dhoop sticks";
    case "wet-dhoop":
      if (has("resealable zipper")) return "Wet dhoop, resealable zipper pack";
      if (grams) return `Wet dhoop, ${grams} g`;
      return has("box pack") ? "Wet dhoop, box" : "Wet dhoop";
    case "bulk": {
      if (/pack of 12/.test(n)) return "Wholesale pack of 12 boxes";
      if (/jhola/.test(n)) return "Wholesale jhola, 12 fragrances, 12 dozen boxes";
      if (/pack of 72/.test(n)) return "Wholesale pack of 72 loban cups";
      if (/havan/.test(n)) return "Wholesale pack of assorted havan cups";
      if (/jar/.test(n)) return "Wholesale pack of assorted dhoop stick jars";
      return "Wholesale pack";
    }
    default: {
      const base = /slim trim/.test(n) ? "Slim Trim agarbatti" : /bambooless/.test(n) ? "Bambooless agarbatti" : "Agarbatti";
      if (sizes) return `${base}, ${sizes}`;
      if (has("eco pack")) return `${base} eco pack, ${grams} g, with a free pack of dhoop sticks`;
      if (has("family pack")) return `${base} family pack, ${grams} g`;
      if (has("zipper")) return `${base}, ${grams} g zipper pouch`;
      if (has("pouch") || has("agarbatti pouch")) return grams ? `${base}, ${grams} g pouch` : sticks ? `${base}, pouch of ${sticks} sticks` : `${base}, pouch`;
      if (grams) return `${base}, ${grams} g box`;
      return base;
    }
  }
}

/* ---------------- run ---------------- */
const rows = parseCsv(readFileSync(CSV, "utf8"));
const existing = {};
for (const f of readdirSync(DIR).filter((f) => f.endsWith(".json"))) {
  const doc = JSON.parse(readFileSync(join(DIR, f), "utf8"));
  if (doc.old_url) existing[doc.old_url.replace(/\/?$/, "/")] = { file: f, doc };
}

let created = 0, updated = 0, skipped = 0;
const ids = new Set(), report = [];
for (const r of rows) {
  const id = +r["Product ID"];
  const csvName = tidy(r.Name.split(" | ")[0]);
  const cats = r.Category.split(",").map((c) => c.trim().toLowerCase());
  const oldUrl = r["Product page link"].replace(/\/?$/, "/");
  const category = categoryFor(id, csvName, cats);
  if (!category) { skipped++; report.push(`skipped (detergent): ${csvName}`); continue; }

  const variants = variantsFrom(r["Pack sizes / variations"]);
  const inStock = /^yes/i.test(r["In stock"]);
  const price = money(r["Selling price"]), mrp = money(r["MRP (regular price)"]);
  const multi = variants.length > 1;
  const single = variants.length === 1 ? variants[0] : null;
  const sale = {
    price: multi ? null : single ? single.price : price,
    mrp: multi ? null : (mrp && mrp > (single ? single.price : price) ? mrp : null),
    variants: multi ? variants : [],
    in_stock: inStock,
    old_url: oldUrl,
  };

  // products already on the new site (the Diwali kits, Tripti ghee): keep everything, update the sale details
  const known = existing[oldUrl] || (id === 9625 ? { file: "sacred-tripti-puja-ghee.json", doc: JSON.parse(readFileSync(join(DIR, "sacred-tripti-puja-ghee.json"), "utf8")) } : null);
  if (known) {
    const doc = { ...known.doc, ...sale };
    writeFileSync(join(DIR, known.file), JSON.stringify(doc, null, 2) + "\n");
    ids.add(known.file.replace(/\.json$/, ""));
    updated++;
    continue;
  }

  let name = RENAME[id] || csvName;
  const freeDhoop = /\+\s*Free Pack of Dhoopstick$/i.test(csvName);
  name = name.replace(/\s*\+\s*Free Pack of Dhoopstick$/i, "");
  const brand = brandFor(id, name, category);
  let slug = slugify(name);
  while (ids.has(slug)) slug += "-2";
  ids.add(slug);

  const doc = {
    name,
    hindi: hindiFor(name, category),
    brand,
    category,
    format: formatFor(id, name, category, cats, multi ? variants : single ? [single] : []),
    description: "",
    images: [],
    packshot: true,
    ...sale,
    price_from: false,
    badge: freeDhoop ? "Free dhoop sticks" : category === "kits" && /holi/i.test(name) ? "Holi" : "",
    featured: false,
    order: 100,
    published: true,
  };
  writeFileSync(join(DIR, `${slug}.json`), JSON.stringify(doc, null, 2) + "\n");
  created++;
}

let removed = 0;
for (const p of PLACEHOLDERS) {
  const f = join(DIR, `${p}.json`);
  if (existsSync(f) && !ids.has(p)) { unlinkSync(f); removed++; }
}

// an old link must never point at a different product's new address
const all = readdirSync(DIR).filter((f) => f.endsWith(".json")).map((f) => ({ id: f.replace(/\.json$/, ""), ...JSON.parse(readFileSync(join(DIR, f), "utf8")) }));
const newIds = new Set(all.map((p) => p.id));
for (const p of all) {
  const oldSlug = (p.old_url || "").replace(/^https?:\/\/[^/]+\/product\//, "").replace(/\/$/, "");
  if (oldSlug && newIds.has(oldSlug) && oldSlug !== p.id) report.push(`CLASH: old link /product/${oldSlug}/ of ${p.id} is also a new product address`);
}

console.log(`${created} products added, ${updated} updated, ${skipped} left out, ${removed} placeholders removed. ${all.length} products in the shop.`);
if (report.length) console.log(report.join("\n"));
