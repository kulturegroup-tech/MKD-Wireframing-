/* Orders are kept in Netlify Blobs (a key-value store that comes with the Netlify site; nothing to set up).
 * One entry per order, keyed by the order number, e.g. TA261010-7KQ4M. */
import { getStore } from "@netlify/blobs";
import { randomBytes } from "node:crypto";

const store = () => getStore({ name: "orders", consistency: "strong" });

export const getOrder = (id) => store().get(id, { type: "json" });
export const saveOrder = (order) => { order.updatedAt = new Date().toISOString(); return store().setJSON(order.id, order); };

export async function listOrders(limit = 300) {
  const { blobs } = await store().list();
  const keys = blobs.map((b) => b.key).sort().reverse().slice(0, limit);
  const orders = await Promise.all(keys.map((k) => store().get(k, { type: "json" })));
  return orders.filter(Boolean);
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
/** Order number: TA + date in India (YYMMDD) + 5 random letters/digits. Sorts by date. */
export function newOrderId(now = new Date()) {
  const ist = new Date(now.getTime() + 5.5 * 3600 * 1000).toISOString();
  const date = ist.slice(2, 4) + ist.slice(5, 7) + ist.slice(8, 10);
  const bytes = randomBytes(5);
  let rand = "";
  for (const b of bytes) rand += ALPHABET[b % ALPHABET.length];
  return `TA${date}-${rand}`;
}
export const newKey = () => randomBytes(12).toString("hex");

export function addHistory(order, status, note = "") {
  order.history = order.history || [];
  order.history.push({ at: new Date().toISOString(), status, note });
}

/** What the customer's order page may see. */
export function publicOrder(o) {
  return {
    id: o.id, createdAt: o.createdAt, status: o.status,
    payment: { method: o.payment.method, state: o.payment.state },
    customer: o.customer, lines: o.lines,
    subtotal: o.subtotal, delivery: o.delivery, codFee: o.codFee, total: o.total,
    tracking: o.tracking || null,
  };
}
