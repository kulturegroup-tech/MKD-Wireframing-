/* Bring an online order up to date with PhonePe, once. Used by the order page and the webhook. */
import { saveOrder, addHistory } from "./orders.mjs";
import { paymentStatus } from "./phonepe.mjs";
import { orderPlacedEmails } from "./mail.mjs";

export async function settle(order, settings, origin) {
  if (order.payment.method !== "online" || order.payment.state !== "pending") return order;
  let st;
  try { st = await paymentStatus(order.id); } catch (e) { console.error(e); return order; }
  if (st.state === "COMPLETED") {
    if (Math.abs(st.amount - order.total) > 0.01) {
      order.payment.state = "review";
      addHistory(order, "review", `Paid ₹${st.amount}, expected ₹${order.total}. Check before shipping.`);
    } else {
      order.payment.state = "paid";
      order.status = "new";
      addHistory(order, "new", `Paid online (${st.mode || "PhonePe"})`);
    }
    order.payment.transactionId = st.transactionId; order.payment.mode = st.mode;
    await saveOrder(order);
    if (!order.notified) { order.notified = true; await saveOrder(order); await orderPlacedEmails(order, settings, origin); }
  } else if (st.state === "FAILED") {
    order.payment.state = "failed"; order.status = "failed";
    addHistory(order, "failed", "Payment failed or was cancelled");
    await saveOrder(order);
  }
  return order;
}
