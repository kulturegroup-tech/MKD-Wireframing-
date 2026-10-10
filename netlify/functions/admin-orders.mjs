/* The orders screen (/admin/orders.html) talks to this.
 *   GET  /api/admin/orders                      -> { orders }  newest first
 *   POST /api/admin/orders { id, status, tracking: { courier, number, url }, note }  -> { order }
 *   POST /api/admin/orders { id, action: "recheck" }   re-checks a pending payment with PhonePe
 * Protected by the ORDERS_PASSWORD environment variable (set it in Netlify). */
import { json, fail, originOf, same } from "../lib/http.mjs";
import { listOrders, getOrder, saveOrder, addHistory } from "../lib/orders.mjs";
import { loadCatalog } from "../lib/shop.mjs";
import { settle } from "../lib/settle.mjs";
import { orderShippedEmail, mailReady } from "../lib/mail.mjs";
import { phonepeReady } from "../lib/phonepe.mjs";

const STATUSES = ["new", "packed", "shipped", "delivered", "cancelled", "returned"];
const clean = (v, max) => String(v ?? "").replace(/[\u0000-\u001f<>]/g, " ").trim().slice(0, max);

export default async (req) => {
  const pass = process.env.ORDERS_PASSWORD;
  if (!pass) return fail("Set ORDERS_PASSWORD in Netlify's environment variables first.", 503);
  const given = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!same(given, pass)) { await new Promise((r) => setTimeout(r, 600)); return fail("Wrong password.", 401); }

  if (req.method === "GET") {
    const orders = await listOrders(400);
    return json({ ok: true, orders, setup: { phonepe: phonepeReady(), phonepeEnv: process.env.PHONEPE_ENV === "production" ? "production" : "sandbox", email: mailReady() } });
  }
  if (req.method !== "POST") return fail("Method not allowed", 405);

  const body = await req.json().catch(() => ({}));
  let order = await getOrder(String(body?.id || ""));
  if (!order) return fail("Order not found.", 404);
  const origin = originOf(req);
  const catalog = await loadCatalog(origin).catch(() => ({ settings: {} }));

  if (body.action === "recheck") {
    order = await settle(order, catalog.settings, origin);
    return json({ ok: true, order });
  }

  const before = order.status;
  if (body.tracking) {
    order.tracking = { courier: clean(body.tracking.courier, 60), number: clean(body.tracking.number, 60), url: clean(body.tracking.url, 300) };
    if (order.tracking.url && !/^https?:\/\//.test(order.tracking.url)) order.tracking.url = "";
  }
  if (body.status && body.status !== order.status) {
    if (!STATUSES.includes(body.status)) return fail("Unknown status.");
    if (order.payment.method === "online" && order.payment.state !== "paid" && body.status !== "cancelled") return fail("This order isn't paid. It can only be cancelled.");
    order.status = body.status;
  }
  const note = clean(body.note, 300);
  if (order.status !== before || note) addHistory(order, order.status, note);
  await saveOrder(order);
  if (order.status === "shipped" && before !== "shipped") await orderShippedEmail(order, catalog.settings, origin);
  return json({ ok: true, order });
};

export const config = { path: "/api/admin/orders" };
