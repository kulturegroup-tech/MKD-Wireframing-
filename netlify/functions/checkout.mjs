/* POST /api/checkout  { items: [{ id, variant, qty }], customer: {...}, payment: "online" | "cod" }
 *   -> { ok, redirect }   PhonePe's payment page, or the order page for cash on delivery
 * GET /api/checkout     -> { online, cod }   which payment methods are switched on */
import { json, fail, originOf } from "../lib/http.mjs";
import { loadCatalog, priceOrder, checkCustomer } from "../lib/shop.mjs";
import { newOrderId, newKey, saveOrder, addHistory } from "../lib/orders.mjs";
import { phonepeReady, createPayment } from "../lib/phonepe.mjs";
import { orderPlacedEmails } from "../lib/mail.mjs";

export default async (req) => {
  const origin = originOf(req);
  let catalog;
  try { catalog = await loadCatalog(origin); } catch (e) { console.error(e); return fail("The shop is busy. Please try again in a minute.", 503); }
  const s = catalog.settings;
  const online = s.online_enabled !== false && phonepeReady();
  const codOn = s.cod_enabled !== false;

  if (req.method === "GET") return json({ ok: true, online, cod: codOn });
  if (req.method !== "POST") return fail("Method not allowed", 405);

  let body;
  try { body = await req.json(); } catch { return fail("Bad request"); }
  const payment = body?.payment === "cod" ? "cod" : "online";
  if (payment === "online" && !online) return fail("Online payment isn't available right now. Please choose cash on delivery.");
  if (payment === "cod" && !codOn) return fail("Cash on delivery isn't available right now. Please pay online.");

  const c = checkCustomer(body?.customer);
  if (c.error) return fail(c.error, 400, { field: c.field });
  const priced = priceOrder(body?.items, catalog, payment);
  if (priced.error) return fail(priced.error, 400, { refresh: !!priced.refresh });
  if (payment === "cod" && s.cod_max && priced.subtotal + priced.delivery > Number(s.cod_max)) {
    return fail(`Cash on delivery is available on orders up to ₹${s.cod_max}. Please pay online.`);
  }

  const now = new Date().toISOString();
  const order = {
    id: newOrderId(), key: newKey(), createdAt: now, updatedAt: now,
    status: payment === "cod" ? "new" : "awaiting_payment",
    payment: { method: payment, state: payment === "cod" ? "cod" : "pending", gateway: payment === "online" ? "phonepe" : "", transactionId: "", mode: "" },
    customer: c.customer, ...priced, tracking: null, notified: false, history: [],
  };
  delete order.error;
  addHistory(order, order.status, payment === "cod" ? "Placed with cash on delivery" : "Waiting for payment");
  const orderPage = `${origin}/order.html?id=${encodeURIComponent(order.id)}&k=${order.key}`;

  if (payment === "cod") {
    order.notified = true;
    await saveOrder(order);
    await orderPlacedEmails(order, s, origin);
    return json({ ok: true, id: order.id, redirect: orderPage });
  }

  await saveOrder(order);
  try {
    const pay = await createPayment({ merchantOrderId: order.id, amount: order.total, redirectUrl: orderPage, message: `Tiranga order ${order.id}` });
    order.payment.gatewayOrderId = pay.orderId || "";
    await saveOrder(order);
    return json({ ok: true, id: order.id, redirect: pay.redirectUrl });
  } catch (e) {
    console.error(e);
    order.status = "failed"; order.payment.state = "failed";
    addHistory(order, "failed", "Could not start the PhonePe payment");
    await saveOrder(order);
    return fail("We couldn't start the payment. Please try again, or choose cash on delivery.", 502);
  }
};

export const config = { path: "/api/checkout" };
