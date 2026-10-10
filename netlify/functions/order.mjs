/* GET /api/order?id=TA...&k=...  -> the order for the confirmation page (checks the payment with PhonePe if it's still pending) */
import { json, fail, originOf, same } from "../lib/http.mjs";
import { getOrder, publicOrder } from "../lib/orders.mjs";
import { loadCatalog } from "../lib/shop.mjs";
import { settle } from "../lib/settle.mjs";

export default async (req) => {
  const u = new URL(req.url);
  const id = (u.searchParams.get("id") || "").slice(0, 40), k = u.searchParams.get("k") || "";
  if (!/^TA\d{6}-[A-Z0-9]{5}$/.test(id)) return fail("We couldn't find this order. Please check the link.", 404);
  let order = await getOrder(id);
  if (!order || !same(order.key, k)) return fail("We couldn't find this order. Please check the link.", 404);
  if (order.payment.state === "pending") {
    const origin = originOf(req);
    const catalog = await loadCatalog(origin).catch(() => ({ settings: {} }));
    order = await settle(order, catalog.settings, origin);
  }
  return json({ ok: true, order: publicOrder(order) });
};

export const config = { path: "/api/order" };
