/* The dealer portal (dealers.html) talks to this.
 *   POST /api/dealer/login   { code }                    -> { token, dealer }
 *   GET  /api/dealer/me      (Authorization: Bearer token) -> { dealer, orders }
 *   POST /api/dealer/orders  { lines: [{ id, qty }], extra, note, poRef }  -> { order }   a new order, in cartons
 *   POST /api/dealer/orders  { action: "cancel", id }    -> { order }   only while it is still "Received"
 * Dealers get their access code from the team (/admin/trade.html). */
import { json, fail, originOf } from "../lib/http.mjs";
import {
  portalReady, dealerByCode, dealerFromRequest, makeToken, publicDealer, tooManyTries, failedTry, clearTries,
  loadTradeCatalog, checkLines, createTradeOrder, saveTradeOrder, getTradeOrder, listDealerOrders, dealerView, addTradeHistory,
} from "../lib/trade.mjs";
import { loadCatalog } from "../lib/shop.mjs";
import { tradeOrderEmails } from "../lib/mail.mjs";

const ipOf = (req, context) => context?.ip || req.headers.get("x-nf-client-connection-ip") || (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "local";

export default async (req, context) => {
  const path = new URL(req.url).pathname.replace(/\/$/, "");

  // GET /api/dealer/login: a status check (is the portal set up, can it reach its storage)
  if (path.endsWith("/login") && req.method === "GET") {
    let storage = "ok";
    try { await tooManyTries("status-check"); } catch (e) { storage = "error: " + e.message; }
    return json({ ok: portalReady() && storage === "ok", ready: portalReady(), storage });
  }
  if (!portalReady()) return fail("The dealer portal is being set up. Please call us to place your order for now.", 500, { setup: true });

  if (path.endsWith("/login")) {
    if (req.method !== "POST") return fail("Method not allowed", 405);
    const ip = ipOf(req, context);
    if (await tooManyTries(ip)) return fail("Too many wrong codes. Please wait 15 minutes, or call us for help.", 429);
    const body = await req.json().catch(() => ({}));
    const dealer = await dealerByCode(body?.code);
    if (!dealer) {
      await failedTry(ip);
      await new Promise((r) => setTimeout(r, 500));
      return fail("That code didn't work. Please check it, or call us for a new one.", 401, { field: "code" });
    }
    await clearTries(ip);
    return json({ ok: true, token: makeToken(dealer), dealer: publicDealer(dealer) });
  }

  const dealer = await dealerFromRequest(req);
  if (!dealer) return fail("Please sign in again.", 401, { signin: true });

  if (path.endsWith("/me")) {
    const orders = await listDealerOrders(dealer.id);
    return json({ ok: true, dealer: publicDealer(dealer), orders: orders.map(dealerView) });
  }

  if (path.endsWith("/orders")) {
    if (req.method !== "POST") return fail("Method not allowed", 405);
    const body = await req.json().catch(() => ({}));

    if (body?.action === "cancel") {
      const o = await getTradeOrder(dealer.id, String(body.id || ""));
      if (!o) return fail("Order not found.", 404);
      if (o.status !== "new") return fail("This order is already being worked on. Please call us to change it.", 409);
      o.status = "cancelled";
      addTradeHistory(o, "dealer", "Cancelled by the dealer");
      await saveTradeOrder(o);
      return json({ ok: true, order: dealerView(o) });
    }

    const origin = originOf(req);
    let byId;
    try { byId = await loadTradeCatalog(origin); } catch { return fail("We couldn't load the product list. Please try again in a minute.", 503); }
    const checked = checkLines(body, byId);
    if (checked.error) return fail(checked.error, 400, checked.refresh ? { refresh: true } : {});
    const o = createTradeOrder(dealer, checked, "dealer");
    await saveTradeOrder(o);
    const settings = (await loadCatalog(origin).catch(() => ({ settings: {} }))).settings;
    await tradeOrderEmails(o, settings, origin);
    return json({ ok: true, order: dealerView(o) });
  }

  return fail("Not found", 404);
};

export const config = { path: ["/api/dealer/login", "/api/dealer/me", "/api/dealer/orders"] };
