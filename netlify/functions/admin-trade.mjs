/* The team's dealer-orders board (/admin/trade.html) talks to this. Same password as the shop orders (ORDERS_PASSWORD).
 *   GET  /api/admin/trade                                  -> { orders, dealers }
 *   POST { action: "order", dealerId, id, status, eta, message, internal, dispatch, lines }  -> { order }
 *   POST { action: "place", dealerId, lines, extra, note, poRef }   an order taken on the phone, entered for the dealer
 *   POST { action: "dealer", id?, dealer: {...} }          add or edit a dealer (a new dealer gets an access code)
 *   POST { action: "new-code", id }                        a fresh access code; the old one stops working */
import { json, fail, originOf, same } from "../lib/http.mjs";
import {
  STATUSES, LABELS, clean, listAllTradeOrders, listDealers, getTradeOrder, saveTradeOrder, addTradeHistory, checkDealer, saveDealer, newCode,
  getDealer, loadTradeCatalog, checkLines, createTradeOrder, truckLoad, pickTruck,
} from "../lib/trade.mjs";
import { loadCatalog } from "../lib/shop.mjs";
import { tradeOrderEmails, tradeUpdateEmail, mailReady } from "../lib/mail.mjs";

const date = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? String(v) : "");
const fmtDate = (d) => new Date(d + "T00:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export default async (req) => {
  const pass = process.env.ORDERS_PASSWORD;
  if (!pass) return fail("Set ORDERS_PASSWORD in Netlify's environment variables first.", 503);
  const given = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!same(given, pass)) { await new Promise((r) => setTimeout(r, 600)); return fail("Wrong password.", 401); }

  if (req.method === "GET") {
    const [orders, dealers] = await Promise.all([listAllTradeOrders(), listDealers()]);
    return json({ ok: true, orders, dealers, setup: { email: mailReady() } });
  }
  if (req.method !== "POST") return fail("Method not allowed", 405);
  const body = await req.json().catch(() => ({}));
  const origin = originOf(req);

  if (body.action === "dealer") {
    const c = checkDealer(body.dealer);
    if (c.error) return fail(c.error, 400, { field: c.field });
    const dealer = await saveDealer(c.dealer, body.id ? String(body.id) : null);
    if (!dealer) return fail("Dealer not found.", 404);
    return json({ ok: true, dealer });
  }

  if (body.action === "new-code") {
    const dealer = await newCode(String(body.id || ""));
    if (!dealer) return fail("Dealer not found.", 404);
    return json({ ok: true, dealer });
  }

  if (body.action === "place") {
    const dealer = await getDealer(String(body.dealerId || ""));
    if (!dealer) return fail("Please choose the dealer.", 400, { field: "dealer" });
    let cat;
    try { cat = await loadTradeCatalog(origin); } catch { return fail("Couldn't load the product list. Try again in a minute.", 500); }
    const checked = checkLines(body, cat);
    if (checked.error) return fail(checked.error);
    const o = createTradeOrder(dealer, checked, "team");
    await saveTradeOrder(o);
    const settings = (await loadCatalog(origin).catch(() => ({ settings: {} }))).settings;
    await tradeOrderEmails(o, settings, origin, { team: false });
    return json({ ok: true, order: o });
  }

  if (body.action === "order") {
    const o = await getTradeOrder(String(body.dealerId || ""), String(body.id || ""));
    if (!o) return fail("Order not found.", 404);
    const was = { status: o.status, eta: o.eta, message: o.message, lr: o.dispatch?.lr };
    const changes = [];
    let touched = false;

    if (body.status !== undefined && body.status !== o.status) {
      if (!STATUSES.includes(body.status)) return fail("Unknown stage.");
      o.status = body.status;
      changes.push(`Moved to ${LABELS[o.status]}`);
    }
    if (body.eta !== undefined && date(body.eta) !== o.eta) {
      o.eta = date(body.eta);
      changes.push(o.eta ? `Expected delivery set to ${fmtDate(o.eta)}` : "Expected delivery date removed");
    }
    if (body.message !== undefined && clean(body.message, 600) !== o.message) {
      o.message = clean(body.message, 600);
      if (o.message) changes.push(`Message to the dealer: ${o.message}`);
    }
    if (body.internal !== undefined && clean(body.internal, 1000) !== o.internal) {
      o.internal = clean(body.internal, 1000);
      addTradeHistory(o, "team", "Internal note updated");
      o.history[o.history.length - 1].private = true;
      touched = true;
    }
    if (body.dispatch && typeof body.dispatch === "object") {
      const d = body.dispatch;
      const next = { transporter: clean(d.transporter, 80), lr: clean(d.lr, 60), vehicle: clean(d.vehicle, 30).toUpperCase(), invoice: clean(d.invoice, 40), date: date(d.date) };
      if (JSON.stringify(next) !== JSON.stringify({ transporter: "", lr: "", vehicle: "", invoice: "", date: "", ...o.dispatch })) {
        o.dispatch = next;
        changes.push("Dispatch details updated");
      }
    }
    if (body.truck !== undefined && String(body.truck || "") !== String(o.truck?.id || "")) {
      let cat;
      try { cat = await loadTradeCatalog(origin); } catch { return fail("Couldn't load the truck sizes. Try again in a minute.", 500); }
      const t = pickTruck(body.truck, cat.trucks);
      if (t.error) return fail(t.error);
      o.truck = t.truck;
      changes.push(o.truck ? `Truck set to ${o.truck.name}` : "Truck removed (part load)");
    }
    if (Array.isArray(body.lines)) {
      const byLine = Object.fromEntries(body.lines.map((l) => [String(l.id), Math.floor(Number(l.qty))]));
      for (const l of o.lines) {
        const q = byLine[l.id];
        if (q !== undefined && q >= 0 && q <= 10000 && q !== l.qty) {
          changes.push(`${l.name}: ${l.qty} → ${q} ${l.unit === "jhola" ? "jholas" : "cartons"}`);
          if (l.ordered === undefined) l.ordered = l.qty;
          l.qty = q;
        }
      }
    }
    if (!changes.length && !touched) return json({ ok: true, order: o, unchanged: true });
    o.load = truckLoad(o.lines, o.truck);
    for (const c of changes) addTradeHistory(o, "team", c);
    await saveTradeOrder(o);
    if (o.status !== was.status || o.eta !== was.eta || (o.message && o.message !== was.message) || o.dispatch?.lr !== was.lr) await tradeUpdateEmail(o, origin);
    return json({ ok: true, order: o });
  }

  return fail("Unknown action.");
};

export const config = { path: "/api/admin/trade" };
