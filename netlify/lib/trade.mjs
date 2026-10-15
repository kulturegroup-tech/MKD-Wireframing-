/* Dealer portal: dealers, their sign-in, and their orders (trade orders), kept in Netlify Blobs.
 *   dealers        D7K2P9            -> the dealer (firm, contact, city, their access code)
 *   dealer-codes   TK7M4QPX          -> D7K2P9   (lookup when a dealer signs in)
 *   trade-orders   D7K2P9/DO261015-4KQ7 -> the order (keyed by dealer, so a dealer's orders list quickly)
 *   dealer-login   <ip hash>         -> failed sign-in count, to slow down guessing
 * Dealers sign in with the access code the team gives them (made in /admin/trade.html). */
import { getStore } from "@netlify/blobs";
import { randomBytes, createHmac, createHash } from "node:crypto";
import { same } from "./http.mjs";

const st = (name) => getStore({ name, consistency: "strong" });
const dealers = () => st("dealers");
const codes = () => st("dealer-codes");
const orders = () => st("trade-orders");
const attempts = () => st("dealer-login");

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I
const rand = (n) => { let s = ""; for (const b of randomBytes(n)) s += ALPHABET[b % ALPHABET.length]; return s; };

export const STAGES = ["new", "confirmed", "production", "ready", "dispatched", "delivered"];
export const STATUSES = [...STAGES, "cancelled"];
export const LABELS = { new: "Received", confirmed: "Confirmed", production: "In production", ready: "Ready to dispatch", dispatched: "Dispatched", delivered: "Delivered", cancelled: "Cancelled" };

export const clean = (v, max) => String(v ?? "").replace(/[\u0000-\u0009\u000b-\u001f<>]/g, " ").replace(/[ \t]+/g, " ").trim().slice(0, max);
const oneLine = (v, max) => clean(v, max).replace(/\s+/g, " ");

/* ---------------- dealers ---------------- */
export const normCode = (c) => String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
export const prettyCode = (c) => { const n = normCode(c); return n.length === 8 ? `${n.slice(0, 4)}-${n.slice(4)}` : n; };

export const getDealer = (id) => dealers().get(String(id || ""), { type: "json" });
export async function listDealers() {
  const { blobs } = await dealers().list();
  const all = await Promise.all(blobs.map((b) => dealers().get(b.key, { type: "json" })));
  return all.filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
}

/** Checks and tidies what the team typed for a dealer. */
export function checkDealer(d = {}) {
  const out = {
    name: oneLine(d.name, 100), contact: oneLine(d.contact, 80),
    phone: String(d.phone || "").replace(/\D/g, "").replace(/^(91|0)(?=\d{10}$)/, ""),
    email: oneLine(d.email, 120).toLowerCase(), city: oneLine(d.city, 60), state: oneLine(d.state, 60),
    ref: oneLine(d.ref, 30), address: clean(d.address, 300), gstin: oneLine(d.gstin, 20).toUpperCase(), notes: clean(d.notes, 500),
    active: d.active !== false,
  };
  if (!out.name) return { error: "Please enter the firm's name.", field: "name" };
  if (out.phone && !/^[6-9]\d{9}$/.test(out.phone)) return { error: "Please enter a 10-digit mobile number.", field: "phone" };
  if (out.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email)) return { error: "Please check the email address.", field: "email" };
  if (!out.city) return { error: "Please enter the city.", field: "city" };
  return { dealer: out };
}

async function issueCode(dealer) {
  if (dealer.code) await codes().delete(normCode(dealer.code));
  let code;
  for (let i = 0; i < 5; i++) { code = rand(8); if (!(await codes().get(code))) break; }
  await codes().set(code, dealer.id);
  dealer.code = prettyCode(code);
  dealer.codeVersion = (dealer.codeVersion || 0) + 1;
  return dealer;
}

export async function saveDealer(fields, id) {
  const now = new Date().toISOString();
  let dealer = id ? await getDealer(id) : null;
  if (id && !dealer) return null;
  if (!dealer) {
    dealer = { id: "D" + rand(6), createdAt: now, codeVersion: 0 };
    Object.assign(dealer, fields);
    await issueCode(dealer);
  } else {
    Object.assign(dealer, fields);
  }
  dealer.updatedAt = now;
  await dealers().setJSON(dealer.id, dealer);
  return dealer;
}

export async function newCode(id) {
  const dealer = await getDealer(id);
  if (!dealer) return null;
  await issueCode(dealer);
  dealer.updatedAt = new Date().toISOString();
  await dealers().setJSON(dealer.id, dealer);
  return dealer;
}

/** A ready-made demo dealer, when DEMO_DEALER_CODE is set in Netlify (for showing the portal).
 *  Created once; the team can edit it, give it a new code or switch it off like any other dealer. */
export async function ensureDemoDealer() {
  const demo = normCode(process.env.DEMO_DEALER_CODE);
  if (demo.length < 6) return null;
  const id = "DDEMO1";
  let d = await getDealer(id);
  if (d) return d;
  const now = new Date().toISOString();
  d = { id, name: process.env.DEMO_DEALER_NAME || "Demo Traders", contact: "Demo Dealer", phone: "", email: "", city: "Kanpur", state: "Uttar Pradesh",
    ref: "DEMO-001", address: "", gstin: "", notes: "Demo dealer for trying the portal. Switch it off or delete its orders when you go live.", active: true,
    code: prettyCode(demo), codeVersion: 1, createdAt: now, updatedAt: now };
  await codes().set(demo, id);
  await dealers().setJSON(id, d);
  return d;
}

export async function dealerByCode(code) {
  const n = normCode(code);
  if (n.length < 6 || n.length > 16) return null;
  if (n === normCode(process.env.DEMO_DEALER_CODE)) await ensureDemoDealer();
  const id = await codes().get(n);
  if (!id) return null;
  const d = await getDealer(id);
  return d && d.active !== false && normCode(d.code) === n ? d : null;
}

/** What a signed-in dealer sees about themselves. */
export const publicDealer = (d) => ({ id: d.id, name: d.name, contact: d.contact || "", city: d.city || "", state: d.state || "", ref: d.ref || "", phone: d.phone || "", email: d.email || "" });

/* ---------------- sign-in ---------------- */
function secret() {
  if (process.env.DEALER_SECRET) return process.env.DEALER_SECRET;
  if (process.env.ORDERS_PASSWORD) return createHash("sha256").update("dealer-session:" + process.env.ORDERS_PASSWORD).digest("hex");
  return "";
}
export const portalReady = () => !!secret();
const sign = (s) => createHmac("sha256", secret()).update(s).digest("base64url");

/** A signed pass the dealer's browser keeps for 30 days. A new access code ends old passes. */
export function makeToken(dealer) {
  const body = Buffer.from(JSON.stringify({ d: dealer.id, v: dealer.codeVersion || 1, exp: Date.now() + 30 * 86400000 })).toString("base64url");
  return `${body}.${sign(body)}`;
}
export async function dealerFromRequest(req) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const [body, mac] = token.split(".");
  if (!body || !mac || !secret() || !same(mac, sign(body))) return null;
  let t; try { t = JSON.parse(Buffer.from(body, "base64url").toString()); } catch { return null; }
  if (!t || t.exp < Date.now()) return null;
  const d = await getDealer(t.d);
  return d && d.active !== false && (d.codeVersion || 1) === t.v ? d : null;
}

/** Slows down anyone guessing codes: 8 wrong tries from one address, then a 15-minute wait. */
const WINDOW = 15 * 60000, MAX_TRIES = 8;
const ipKey = (ip) => createHash("sha256").update("ip:" + (ip || "unknown")).digest("hex").slice(0, 32);
export async function tooManyTries(ip) {
  const r = await attempts().get(ipKey(ip), { type: "json" });
  return !!(r && Date.now() - r.since < WINDOW && r.n >= MAX_TRIES);
}
export async function failedTry(ip) {
  const k = ipKey(ip);
  const r = await attempts().get(k, { type: "json" });
  const fresh = !r || Date.now() - r.since >= WINDOW;
  await attempts().setJSON(k, fresh ? { n: 1, since: Date.now() } : { n: r.n + 1, since: r.since });
}
export const clearTries = (ip) => attempts().delete(ipKey(ip));

/* ---------------- the dealer list (built from the products) ---------------- */
let cache = null;
export async function loadTradeCatalog(origin) {
  if (cache && cache.origin === origin && Date.now() - cache.at < 60_000) return cache.byId;
  const r = await fetch(`${origin}/trade.json`, { headers: { "Cache-Control": "no-cache" } });
  if (!r.ok) throw new Error(`trade.json ${r.status}`);
  const j = await r.json();
  const byId = Object.fromEntries(j.items.map((x) => [x.id, x]));
  cache = { origin, at: Date.now(), byId };
  return byId;
}

/** Checks an order from a dealer (or from the team on a dealer's behalf). */
export function checkLines(body, byId) {
  const items = Array.isArray(body?.lines) ? body.lines : [];
  if (items.length > 150) return { error: "That's more than 150 different items. Please split it into two orders." };
  const lines = [], seen = new Set();
  for (const it of items) {
    const p = byId[String(it?.id || "")];
    const qty = Math.floor(Number(it?.qty));
    if (!p) return { error: "One of the items is no longer on the list. Please remove it and try again.", refresh: true };
    if (!(qty >= 1 && qty <= 10000)) return { error: `Please enter between 1 and 10,000 cartons for ${p.name}.` };
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    lines.push({ id: p.id, name: p.name, brand: p.brand, format: p.format || "", carton: p.carton || "", image: p.image || "", qty });
  }
  const extra = clean(body?.extra, 1500);
  if (!lines.length && !extra) return { error: "Please add at least one item to the order." };
  return { lines, extra, note: clean(body?.note, 800), poRef: oneLine(body?.poRef, 40) };
}

/* ---------------- orders ---------------- */
export function newTradeOrderId(now = new Date()) {
  const ist = new Date(now.getTime() + 5.5 * 3600 * 1000).toISOString();
  return `DO${ist.slice(2, 4)}${ist.slice(5, 7)}${ist.slice(8, 10)}-${rand(4)}`;
}
const okey = (o) => `${o.dealerId}/${o.id}`;
export const getTradeOrder = (dealerId, id) => orders().get(`${dealerId}/${id}`, { type: "json" });
export const saveTradeOrder = (o) => { o.updatedAt = new Date().toISOString(); return orders().setJSON(okey(o), o); };

async function loadKeys(keys) {
  const out = await Promise.all(keys.map((k) => orders().get(k, { type: "json" })));
  return out.filter(Boolean);
}
const byNewest = (a, b) => (a.createdAt < b.createdAt ? 1 : -1);
export async function listDealerOrders(dealerId) {
  const { blobs } = await orders().list({ prefix: `${dealerId}/` });
  const keys = blobs.map((b) => b.key).sort((a, b) => (a.split("/")[1] < b.split("/")[1] ? 1 : -1)).slice(0, 200);
  return (await loadKeys(keys)).sort(byNewest);
}
export async function listAllTradeOrders(limit = 600) {
  const { blobs } = await orders().list();
  const keys = blobs.map((b) => b.key).sort((a, b) => (a.split("/")[1] < b.split("/")[1] ? 1 : -1)).slice(0, limit);
  return (await loadKeys(keys)).sort(byNewest);
}

export function addTradeHistory(o, by, text) {
  o.history = o.history || [];
  o.history.push({ at: new Date().toISOString(), by, text });
}

export function createTradeOrder(dealer, checked, by) {
  const now = new Date().toISOString();
  const o = {
    id: newTradeOrderId(), dealerId: dealer.id,
    dealer: { name: dealer.name, contact: dealer.contact || "", city: dealer.city || "", state: dealer.state || "", ref: dealer.ref || "", phone: dealer.phone || "", email: dealer.email || "" },
    lines: checked.lines, extra: checked.extra, note: checked.note, poRef: checked.poRef,
    status: "new", eta: "", message: "", internal: "", dispatch: { transporter: "", lr: "", vehicle: "", invoice: "", date: "" },
    placedBy: by, createdAt: now, history: [],
  };
  addTradeHistory(o, by, by === "team" ? "Order entered by the team" : "Order placed");
  return o;
}

/** What the dealer may see of an order (the team's internal note stays private). */
export function dealerView(o) {
  const { internal, history, ...rest } = o;
  return { ...rest, history: (history || []).filter((h) => !h.private).map(({ at, text }) => ({ at, text })) };
}
