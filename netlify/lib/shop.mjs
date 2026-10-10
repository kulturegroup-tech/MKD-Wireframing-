/* Prices and checks for the checkout. Everything is worked out again here from products.json and shop.json
 * on the live site, so a changed price in someone's browser can't change what they pay. */
const SETTINGS = { delivery_fee: 49, free_delivery_above: 499, cod_enabled: true, cod_fee: 40, cod_max: 3000, online_enabled: true };

let cache = null;
export async function loadCatalog(origin) {
  if (cache && cache.origin === origin && Date.now() - cache.at < 60_000) return cache.data;
  const [p, s] = await Promise.all([
    fetch(`${origin}/products.json`, { headers: { "Cache-Control": "no-cache" } }).then((r) => { if (!r.ok) throw new Error(`products.json ${r.status}`); return r.json(); }),
    fetch(`${origin}/shop.json`, { headers: { "Cache-Control": "no-cache" } }).then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
  ]);
  const byId = Object.fromEntries(p.products.map((x) => [x.id, x]));
  const data = { byId, settings: { ...SETTINGS, ...s, order_email: process.env.ORDER_EMAIL || s.order_email || "" } };
  cache = { origin, at: Date.now(), data };
  return data;
}

const round = (n) => Math.round(n * 100) / 100;

/** items: [{ id, variant, qty }] -> lines and totals, or { error } */
export function priceOrder(items, catalog, payment) {
  if (!Array.isArray(items) || !items.length) return { error: "Your cart is empty." };
  if (items.length > 40) return { error: "That's a lot of different products. Please contact us for a bulk order." };
  const lines = [];
  for (const it of items) {
    const p = catalog.byId[String(it?.id || "")];
    const qty = Math.floor(Number(it?.qty));
    if (!p) return { error: "Something in your cart is no longer sold. Please remove it and try again.", refresh: true };
    const v = (p.variants || []).find((x) => x.label === String(it.variant || ""));
    if (!v) return { error: `The pack you chose for ${p.name} has changed. Please add it to the cart again.`, refresh: true };
    if (!v.inStock) return { error: `${p.name}${v.label ? ` (${v.label})` : ""} has just sold out. Please remove it to continue.`, refresh: true };
    if (!(qty >= 1 && qty <= 50)) return { error: `Please choose between 1 and 50 of ${p.name}.` };
    lines.push({ id: p.id, name: p.name, variant: v.label, price: v.price, qty, total: round(v.price * qty), image: p.image || "" });
  }
  const s = catalog.settings;
  const subtotal = round(lines.reduce((a, l) => a + l.total, 0));
  const delivery = subtotal >= Number(s.free_delivery_above) ? 0 : Number(s.delivery_fee) || 0;
  const codFee = payment === "cod" ? Number(s.cod_fee) || 0 : 0;
  return { lines, subtotal, delivery, codFee, total: round(subtotal + delivery + codFee) };
}

const clean = (v, max) => String(v ?? "").replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

export function checkCustomer(c = {}) {
  const out = {
    name: clean(c.name, 80), phone: String(c.phone || "").replace(/\D/g, "").replace(/^(91|0)(?=\d{10}$)/, ""),
    email: clean(c.email, 120).toLowerCase(), address1: clean(c.address1, 140), address2: clean(c.address2, 140),
    pincode: String(c.pincode || "").replace(/\D/g, ""), city: clean(c.city, 60), state: clean(c.state, 60),
  };
  if (!out.name) return { error: "Please enter your name.", field: "name" };
  if (!/^[6-9]\d{9}$/.test(out.phone)) return { error: "Please enter a 10-digit mobile number.", field: "phone" };
  if (out.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email)) return { error: "Please check your email address.", field: "email" };
  if (!out.address1) return { error: "Please enter your house, building and street.", field: "address1" };
  if (!/^[1-9]\d{5}$/.test(out.pincode)) return { error: "Please enter a 6-digit pincode.", field: "pincode" };
  if (!out.city) return { error: "Please enter your city.", field: "city" };
  if (!out.state) return { error: "Please choose your state.", field: "state" };
  return { customer: out };
}
