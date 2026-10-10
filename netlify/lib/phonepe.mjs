/* PhonePe Payment Gateway, Standard Checkout (v2 API).
 * Set these in Netlify → Site configuration → Environment variables (from the PhonePe Business dashboard → Developer settings):
 *   PHONEPE_CLIENT_ID, PHONEPE_CLIENT_SECRET, PHONEPE_CLIENT_VERSION   the API keys
 *   PHONEPE_ENV = sandbox | production                                 sandbox for testing, production to take real money
 *   PHONEPE_WEBHOOK_USER, PHONEPE_WEBHOOK_PASSWORD                      the username/password you set for the webhook
 *   PHONEPE_MERCHANT_ID (optional)                                      sent as X-MERCHANT-ID on status checks
 * Docs: https://developer.phonepe.com/payment-gateway/website-integration/standard-checkout/api-integration/api-reference/authorization */
import { createHash } from "node:crypto";

const URLS = {
  sandbox: { auth: "https://api-preprod.phonepe.com/apis/pg-sandbox/v1/oauth/token", pg: "https://api-preprod.phonepe.com/apis/pg-sandbox" },
  production: { auth: "https://api.phonepe.com/apis/identity-manager/v1/oauth/token", pg: "https://api.phonepe.com/apis/pg" },
};
const env = () => (process.env.PHONEPE_ENV === "production" ? "production" : "sandbox");
const urls = () => ({ auth: process.env.PHONEPE_AUTH_URL || URLS[env()].auth, pg: process.env.PHONEPE_PG_URL || URLS[env()].pg });

export const phonepeReady = () => !!(process.env.PHONEPE_CLIENT_ID && process.env.PHONEPE_CLIENT_SECRET);

let token = null; // { value, expiresAt (ms) }
async function authToken() {
  if (token && token.expiresAt - Date.now() > 60_000) return token.value;
  const body = new URLSearchParams({
    client_id: process.env.PHONEPE_CLIENT_ID, client_version: process.env.PHONEPE_CLIENT_VERSION || "1",
    client_secret: process.env.PHONEPE_CLIENT_SECRET, grant_type: "client_credentials",
  });
  const r = await fetch(urls().auth, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(`PhonePe sign-in failed (${r.status}): ${j.message || j.code || "no token"}`);
  const exp = Number(j.expires_at) || 0;
  token = { value: j.access_token, expiresAt: exp ? (exp < 1e12 ? exp * 1000 : exp) : Date.now() + 10 * 60_000 };
  return token.value;
}

async function call(method, path, body) {
  const headers = { "Content-Type": "application/json", Authorization: `O-Bearer ${await authToken()}` };
  if (process.env.PHONEPE_MERCHANT_ID) headers["X-MERCHANT-ID"] = process.env.PHONEPE_MERCHANT_ID;
  const r = await fetch(urls().pg + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`PhonePe ${path} failed (${r.status}): ${j.message || j.code || ""}`);
  return j;
}

/** Start a payment. Returns { redirectUrl, orderId }. amount in rupees. */
export async function createPayment({ merchantOrderId, amount, redirectUrl, message }) {
  const j = await call("POST", "/checkout/v2/pay", {
    merchantOrderId,
    amount: Math.round(amount * 100), // paise
    expireAfter: 1200,
    paymentFlow: { type: "PG_CHECKOUT", message: message || `Order ${merchantOrderId}`, merchantUrls: { redirectUrl } },
  });
  if (!j.redirectUrl) throw new Error("PhonePe did not return a payment page");
  return { redirectUrl: j.redirectUrl, orderId: j.orderId };
}

/** Ask PhonePe how a payment went. Returns { state: COMPLETED | FAILED | PENDING, amount (rupees), transactionId, mode }. */
export async function paymentStatus(merchantOrderId) {
  const j = await call("GET", `/checkout/v2/order/${encodeURIComponent(merchantOrderId)}/status?details=false`);
  const d = (j.paymentDetails || [])[0] || {};
  return { state: j.state, amount: (Number(j.amount) || 0) / 100, transactionId: d.transactionId || "", mode: d.paymentMode || "", orderId: j.orderId || "" };
}

/** PhonePe signs webhooks with Authorization: SHA256(username:password). */
export function webhookAuthorised(header) {
  const user = process.env.PHONEPE_WEBHOOK_USER, pass = process.env.PHONEPE_WEBHOOK_PASSWORD;
  if (!user || !pass || !header) return false;
  const expected = createHash("sha256").update(`${user}:${pass}`).digest("hex");
  const got = String(header).trim().replace(/^(SHA256|Bearer)\s+/i, "").toLowerCase();
  return got.length === expected.length && createHash("sha256").update(got).digest("hex") === createHash("sha256").update(expected).digest("hex");
}
