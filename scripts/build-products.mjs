/* Products: content/products/*.json (one file per product, written by the admin) -> dist/products.json */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { CONTENT, DIST, readJson, listFiles, rel } from "./lib.mjs";

export const CATEGORIES = [
  { slug: "agarbatti", name: "Agarbatti", hindi: "अगरबत्ती" },
  { slug: "dhoopbatti", name: "Dhoopbatti", hindi: "धूपबत्ती" },
  { slug: "havan-cup", name: "Havan cup dhoop", hindi: "हवन कप" },
  { slug: "jar", name: "Jar packs", hindi: "धूप जार" },
  { slug: "kits", name: "Poojan kits", hindi: "पूजन किट" },
];

const num = (v) => (v === "" || v === null || v === undefined || isNaN(+v) ? null : +v);

export function buildProducts() {
  const dir = join(CONTENT, "products");
  const products = [];
  for (const file of listFiles(dir, ".json")) {
    const p = readJson(join(dir, file));
    if (!p || !p.name || p.published === false) continue;
    const category = CATEGORIES.some((c) => c.slug === p.category) ? p.category : "agarbatti";
    const images = (Array.isArray(p.images) ? p.images : p.images ? [p.images] : []).filter(Boolean).map((src) => rel(src));
    const price = num(p.price), mrp = num(p.mrp);
    products.push({
      id: file.replace(/\.json$/, ""),
      name: p.name,
      hindi: p.hindi || "",
      brand: p.brand || "Tiranga",
      category,
      format: p.format || "",
      description: p.description || "",
      price: price != null ? { amount: price, regular: mrp && mrp > price ? mrp : null, currency: "INR", from: !!p.price_from } : null,
      image: images[0] || null,
      images,
      pack: !!p.packshot,
      badge: (p.badge || "").trim(),
      url: p.buy_url || "",
      buyLabel: p.buy_label || "",
      featured: !!p.featured,
      order: num(p.order) ?? 999,
    });
  }
  // featured first, then the order number set in the admin, then category, then name
  const catIndex = (s) => CATEGORIES.findIndex((c) => c.slug === s);
  products.sort((a, b) => (b.featured - a.featured) || (a.order - b.order) || (catIndex(a.category) - catIndex(b.category)) || a.name.localeCompare(b.name));
  writeFileSync(join(DIST, "products.json"), JSON.stringify({ source: "cms", updated: new Date().toISOString(), categories: CATEGORIES, products }, null, 2));
  return products.length;
}
