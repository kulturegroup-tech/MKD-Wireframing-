/* POST /api/phonepe-webhook  PhonePe calls this when a payment completes or fails, even if the customer closed the tab.
 * Set the webhook URL in the PhonePe dashboard to https://<your site>/api/phonepe-webhook with a username and password,
 * and put the same two in Netlify as PHONEPE_WEBHOOK_USER and PHONEPE_WEBHOOK_PASSWORD.
 * The payment is always re-checked with PhonePe's status API before an order is marked paid. */
import { json, fail, originOf } from "../lib/http.mjs";
import { getOrder } from "../lib/orders.mjs";
import { loadCatalog } from "../lib/shop.mjs";
import { webhookAuthorised } from "../lib/phonepe.mjs";
import { settle } from "../lib/settle.mjs";

export default async (req) => {
  if (req.method !== "POST") return fail("Method not allowed", 405);
  if (!webhookAuthorised(req.headers.get("authorization"))) return fail("Unauthorised", 401);
  const body = await req.json().catch(() => ({}));
  const id = body?.payload?.merchantOrderId || body?.payload?.originalMerchantOrderId;
  if (!id) return json({ ok: true, ignored: true });
  const order = await getOrder(String(id));
  if (!order) return json({ ok: true, ignored: true });
  const origin = originOf(req);
  const catalog = await loadCatalog(origin).catch(() => ({ settings: {} }));
  await settle(order, catalog.settings, origin);
  return json({ ok: true });
};

export const config = { path: "/api/phonepe-webhook" };
