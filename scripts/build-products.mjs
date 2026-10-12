/* The shop: content/products/*.json (one file per product, written by the admin) and content/site/shop.json
 *   -> dist/products.json   the catalogue the shop pages and the checkout read (prices are re-checked on the server)
 *   -> dist/shop.json       delivery charges, COD and other shop settings
 *   -> dist/product/<file name>.html   one page per product, with Add to cart
 *   -> dist/_redirects      old store links forward to the new product pages */
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, CONTENT, DIST, DOMAIN, readJson, listFiles, rel, esc } from "./lib.mjs";
import { pageShell } from "./shell.mjs";

export const CATEGORIES = [
  { slug: "agarbatti", name: "Agarbatti", hindi: "अगरबत्ती" },
  { slug: "bambooless", name: "Bambooless sticks", hindi: "बिना बाँस" },
  { slug: "dhoopbatti", name: "Dhoopbatti", hindi: "धूपबत्ती" },
  { slug: "dhoop-cone", name: "Dhoop cones", hindi: "धूप कोन" },
  { slug: "wet-dhoop", name: "Wet dhoop", hindi: "गीली धूप" },
  { slug: "havan-cup", name: "Havan cup dhoop", hindi: "हवन कप" },
  { slug: "jar", name: "Jar packs", hindi: "धूप जार" },
  { slug: "gulab-jal", name: "Gulab jal", hindi: "गुलाब जल" },
  { slug: "puja-essentials", name: "Puja essentials", hindi: "पूजा सामग्री" },
  { slug: "kits", name: "Poojan kits", hindi: "पूजन किट" },
];

export const SHOP_DEFAULTS = {
  delivery_fee: 49,
  free_delivery_above: 499,
  cod_enabled: true,
  cod_fee: 40,
  cod_max: 3000,
  online_enabled: true,
  order_email: "contact@mkdtiranga.com",
  phone: "+91 63890 04433",
  whatsapp: "916389004433",
  dispatch_note: "Ships from Kanpur in 1 to 2 working days",
  delivery_note: "Delivered in 2 to 5 working days across India",
  manufacturer: "Maa Kamakhya Darbar Fragrances (India) Pvt. Ltd., 368, Harris Ganj, Cantt, Kanpur 208004, Uttar Pradesh",
};

const num = (v) => (v === "" || v === null || v === undefined || isNaN(+v) ? null : +v);
const yes = (v, dflt = true) => (v === undefined || v === null || v === "" ? dflt : v === true || v === "true");
const inr = (n) => "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });

export function readShop() {
  const s = { ...SHOP_DEFAULTS, ...(readJson(join(CONTENT, "site", "shop.json"), {}) || {}) };
  for (const k of ["delivery_fee", "free_delivery_above", "cod_fee", "cod_max"]) s[k] = num(s[k]) ?? SHOP_DEFAULTS[k];
  s.cod_enabled = yes(s.cod_enabled); s.online_enabled = yes(s.online_enabled);
  return s;
}

/** One product file from the admin -> the shape the shop uses. */
function normalise(p, id) {
  const category = CATEGORIES.some((c) => c.slug === p.category) ? p.category : "agarbatti";
  const images = (Array.isArray(p.images) ? p.images : p.images ? [p.images] : []).filter(Boolean).map((src) => rel(src));
  const productInStock = yes(p.in_stock);
  // sizes/packs: a list in the admin, or the single price on the product
  let variants = (Array.isArray(p.variants) ? p.variants : [])
    .map((v) => ({ label: String(v?.label || "").trim(), price: num(v?.price), mrp: num(v?.mrp), inStock: productInStock && yes(v?.in_stock) }))
    .filter((v) => v.label && v.price != null && v.price > 0);
  if (!variants.length && num(p.price) != null && num(p.price) > 0) {
    variants = [{ label: "", price: num(p.price), mrp: num(p.mrp), inStock: productInStock }];
  }
  variants.forEach((v) => { if (!(v.mrp > v.price)) v.mrp = null; });
  const buyable = variants.filter((v) => v.inStock);
  const cheapest = (buyable.length ? buyable : variants).reduce((a, v) => (!a || v.price < a.price ? v : a), null);
  return {
    id, name: p.name, hindi: p.hindi || "", brand: p.brand || "Tiranga", category,
    format: p.format || "", description: p.description || "", badge: (p.badge || "").trim(),
    image: images[0] || null, images, pack: !!p.packshot,
    url: `product/${id}.html`,
    variants,
    price: cheapest ? { amount: cheapest.price, regular: variants.length === 1 ? cheapest.mrp : null, currency: "INR", from: variants.length > 1 || !!p.price_from } : null,
    sellable: variants.length > 0,
    inStock: buyable.length > 0,
    featured: !!p.featured,
    order: num(p.order) ?? 999,
    oldUrl: (p.old_url || "").trim(),
  };
}

export function readProducts() {
  const dir = join(CONTENT, "products");
  const products = [];
  for (const file of listFiles(dir, ".json")) {
    const p = readJson(join(dir, file));
    if (!p || !p.name || p.published === false) continue;
    products.push(normalise(p, file.replace(/\.json$/, "")));
  }
  // featured first, then the order number set in the admin, then category, then name
  const catIndex = (s) => CATEGORIES.findIndex((c) => c.slug === s);
  products.sort((a, b) => (b.featured - a.featured) || (a.order - b.order) || (catIndex(a.category) - catIndex(b.category)) || a.name.localeCompare(b.name));
  return products;
}

const catName = (slug) => (CATEGORIES.find((c) => c.slug === slug) || {}).name || slug;

function priceHtml(p) {
  if (!p.price) return "";
  return `${p.price.from ? "From " : ""}${inr(p.price.amount)}${p.price.regular ? ` <s>${inr(p.price.regular)}</s>` : ""}`;
}

/** Product card, the same markup products.js draws on the shop page. */
export function cardHtml(p, prefix = "") {
  const visual = p.image
    ? `<span class="pcard-visual${p.pack ? " is-pack" : ""}"><img src="${esc(prefix + p.image)}" alt="${esc(p.name)}" loading="lazy">${p.badge ? `<span class="pcard-tag">${esc(p.badge)}</span>` : ""}${p.sellable && !p.inStock ? '<span class="pcard-sold">Sold out</span>' : ""}</span>`
    : `<span class="pcard-visual ${p.brand === "Tiranga" ? "brand-tiranga-bg" : "brand-sacred-bg"}"><span class="dev" lang="hi">${esc(p.hindi || p.name)}</span>${p.badge ? `<span class="pcard-tag">${esc(p.badge)}</span>` : ""}</span>`;
  const action = !p.sellable
    ? `<a class="pcard-add is-quiet" href="${prefix}${p.url}">See details</a>`
    : !p.inStock
      ? `<span class="pcard-add is-off">Sold out</span>`
      : p.variants.length > 1
        ? `<a class="pcard-add" href="${prefix}${p.url}">Choose a pack</a>`
        : `<button class="pcard-add" type="button" data-add-id="${esc(p.id)}">Add to cart</button>`;
  return `<article class="pcard">
  <a class="pcard-link" href="${prefix}${p.url}">
    ${visual}
    <span class="pcard-meta"><span class="pcard-brand">${esc(p.brand)}</span><span class="pcard-name">${esc(p.name)}</span><span class="pcard-format">${esc(p.format || catName(p.category))}</span>${p.price ? `<span class="pcard-price">${priceHtml(p)}</span>` : ""}</span>
  </a>
  ${action}
</article>`;
}

function productPage(p, all, shop, shell) {
  const P = "../";
  const imgs = p.images.length ? p.images : [];
  const first = p.variants.find((v) => v.inStock) || p.variants[0];
  const off = first && first.mrp ? Math.round((1 - first.price / first.mrp) * 100) : 0;
  const gallery = imgs.length
    ? `<figure class="pdp-main${p.pack ? " is-pack" : ""}"><img src="${esc(P + imgs[0])}" alt="${esc(p.name)}" data-pdp-main></figure>
      ${imgs.length > 1 ? `<div class="pdp-thumbs" role="group" aria-label="Photos">${imgs.map((src, i) => `<button type="button" aria-label="Photo ${i + 1}" aria-pressed="${i === 0}" data-pdp-thumb="${esc(P + src)}"><img src="${esc(P + src)}" alt="" loading="lazy"></button>`).join("")}</div>` : ""}`
    : `<figure class="pdp-main pdp-type ${p.brand === "Tiranga" ? "brand-tiranga-bg" : "brand-sacred-bg"}"><span class="dev" lang="hi">${esc(p.hindi || p.name)}</span></figure>`;

  const variantPicker = p.variants.length > 1
    ? `<fieldset class="pdp-variants"><legend>Choose a pack</legend>${p.variants.map((v, i) => `<label><input type="radio" name="variant" value="${i}"${v === first ? " checked" : ""}${v.inStock ? "" : " disabled"}><span>${esc(v.label)}<small>${inr(v.price)}${v.inStock ? "" : " · sold out"}</small></span></label>`).join("")}</fieldset>`
    : "";

  const buy = !p.sellable
    ? `<p class="pdp-soon">This one is not in the online shop yet. Ask us about it on <a class="link" href="https://wa.me/${esc(shop.whatsapp)}?text=${encodeURIComponent("Hi, I'd like to buy " + p.name)}" target="_blank" rel="noopener">WhatsApp</a>, or find it at your local shop.</p>
      <a class="btn btn-ghost" href="${P}index.html#partner">Ask about bulk supply</a>`
    : `<div class="pdp-buy">
        <div class="qty" data-qty><button type="button" data-qty-step="-1" aria-label="One less">−</button><input type="number" inputmode="numeric" min="1" max="50" value="1" aria-label="Quantity" data-qty-input><button type="button" data-qty-step="1" aria-label="One more">+</button></div>
        <button class="btn btn-primary" type="button" data-pdp-add${p.inStock ? "" : " disabled"}>${p.inStock ? "Add to cart" : "Sold out"}</button>
      </div>
      <button class="btn btn-ghost pdp-now" type="button" data-pdp-now${p.inStock ? "" : " hidden"}>Buy now</button>
      <ul class="pdp-perks">
        <li>Free delivery on orders above ${inr(shop.free_delivery_above)}</li>
        ${shop.cod_enabled ? "<li>Cash on delivery available</li>" : ""}
        <li>${esc(shop.dispatch_note)}</li>
      </ul>`;

  const related = all.filter((x) => x.id !== p.id && (x.category === p.category || x.brand === p.brand))
    .sort((a, b) => (b.category === p.category) - (a.category === p.category) || (b.sellable - a.sellable))
    .slice(0, 4);

  const ld = {
    "@context": "https://schema.org", "@type": "Product", name: p.name, description: p.description || p.format,
    brand: { "@type": "Brand", name: p.brand }, category: catName(p.category),
    image: imgs.map((src) => `${DOMAIN}/${src}`),
    manufacturer: { "@type": "Organization", name: "Maa Kamakhya Darbar Fragrances (India) Pvt. Ltd." },
    countryOfOrigin: "IN",
    url: `${DOMAIN}/${p.url}`,
  };
  if (p.sellable) {
    ld.offers = p.variants.length > 1
      ? { "@type": "AggregateOffer", priceCurrency: "INR", lowPrice: Math.min(...p.variants.map((v) => v.price)), highPrice: Math.max(...p.variants.map((v) => v.price)), offerCount: p.variants.length, availability: `https://schema.org/${p.inStock ? "InStock" : "OutOfStock"}` }
      : { "@type": "Offer", priceCurrency: "INR", price: first.price, availability: `https://schema.org/${p.inStock ? "InStock" : "OutOfStock"}`, url: `${DOMAIN}/${p.url}` };
  }
  const data = { id: p.id, name: p.name, variants: p.variants };

  const body = `<main class="pdp" data-pdp>
  <nav class="crumbs wrap" aria-label="Breadcrumb"><a href="${P}products.html">Shop</a><span aria-hidden="true">/</span><a href="${P}products.html#${p.category}">${esc(catName(p.category))}</a><span aria-hidden="true">/</span><span aria-current="page">${esc(p.name)}</span></nav>
  <div class="wrap pdp-grid">
    <div class="pdp-gallery">
      ${gallery}
    </div>
    <div class="pdp-info">
      <p class="pdp-brand">${esc(p.brand)} · ${esc(catName(p.category))}${p.badge ? ` <span class="pdp-badge">${esc(p.badge)}</span>` : ""}</p>
      <h1>${esc(p.name)}</h1>
      ${p.hindi ? `<p class="pdp-hindi" lang="hi">${esc(p.hindi)}</p>` : ""}
      ${p.format ? `<p class="pdp-format">${esc(p.format)}</p>` : ""}
      ${p.sellable ? `<p class="pdp-price" data-pdp-price><b>${inr(first.price)}</b>${first.mrp ? ` <s>MRP ${inr(first.mrp)}</s> <span class="pdp-off">${off}% off</span>` : ""}</p>
      <p class="pdp-tax">Inclusive of all taxes</p>` : ""}
      ${variantPicker}
      ${buy}
      ${p.description ? `<div class="pdp-desc"><h2>About this product</h2><p>${esc(p.description)}</p></div>` : ""}
      <dl class="pdp-specs">
        <div><dt>Brand</dt><dd>${esc(p.brand)}</dd></div>
        ${p.format ? `<div><dt>Pack</dt><dd>${esc(p.format)}</dd></div>` : ""}
        <div><dt>Made by</dt><dd>${esc(shop.manufacturer)}</dd></div>
        <div><dt>Country of origin</dt><dd>India</dd></div>
      </dl>
    </div>
  </div>
  ${related.length ? `<section class="pdp-more wrap" aria-labelledby="more-title"><h2 id="more-title">You may also like</h2><div class="catalog-grid">${related.map((r) => cardHtml(r, P)).join("\n")}</div></section>` : ""}
</main>
<script type="application/json" data-pdp-json>${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;

  return shell({
    title: `${p.name} | ${p.brand}`, description: (p.description || `${p.name}, ${p.format}`).slice(0, 158),
    path: p.url, image: imgs[0] ? `${DOMAIN}/${imgs[0]}` : `${DOMAIN}/brand/share.jpg`, body, deep: true, current: "products.html",
    type: "product", extraHead: `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>\n`,
  });
}

export function buildProducts() {
  const products = readProducts();
  const shop = readShop();
  const publicShop = {
    delivery_fee: shop.delivery_fee, free_delivery_above: shop.free_delivery_above,
    cod_enabled: shop.cod_enabled, cod_fee: shop.cod_fee, cod_max: shop.cod_max, online_enabled: shop.online_enabled,
    phone: shop.phone, whatsapp: shop.whatsapp, dispatch_note: shop.dispatch_note, delivery_note: shop.delivery_note,
    order_email: shop.order_email,
  };
  const out = products.map(({ oldUrl, order, ...p }) => p);
  writeFileSync(join(DIST, "products.json"), JSON.stringify({ source: "cms", updated: new Date().toISOString(), categories: CATEGORIES, products: out }, null, 2));
  writeFileSync(join(DIST, "shop.json"), JSON.stringify(publicShop, null, 2));

  // one page per product
  const shell = pageShell();
  mkdirSync(join(DIST, "product"), { recursive: true });
  for (const p of products) writeFileSync(join(DIST, p.url), productPage(p, products, shop, shell));

  // old WooCommerce links -> new pages, so Google rankings and shared links carry over
  const lines = ["# Generated by scripts/build-products.mjs. Old store links forward to the new pages."];
  for (const p of products) lines.push(`/product/${p.id}/  /${p.url}  301`);
  for (const p of products) {
    if (!p.oldUrl) continue;
    let path = p.oldUrl.replace(/^https?:\/\/[^/]+/, "");
    if (!path.startsWith("/")) path = "/" + path;
    lines.push(`${path.replace(/\/?$/, "/")}  /${p.url}  301`, `${path.replace(/\/$/, "")}  /${p.url}  301`);
  }
  const fixed = readFileSync(join(ROOT, "redirects.txt"), "utf8");
  writeFileSync(join(DIST, "_redirects"), lines.join("\n") + "\n\n" + fixed);
  return products.length;
}
