/* Order emails, sent through Resend (resend.com, free for up to 3,000 emails a month).
 * Optional. Set RESEND_API_KEY and MAIL_FROM (for example "Tiranga Agarbatti <orders@tirangaagarbatti.com>")
 * in Netlify's environment variables. Without them the shop still works; orders are on /admin/orders.html. */
const inr = (n) => "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export const mailReady = () => !!(process.env.RESEND_API_KEY && process.env.MAIL_FROM);

async function send(to, subject, html, replyTo) {
  if (!mailReady() || !to) return false;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.MAIL_FROM, to: [to], subject, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
    });
    if (!r.ok) console.error("email failed", r.status, await r.text());
    return r.ok;
  } catch (e) { console.error("email failed", e.message); return false; }
}

function table(o) {
  const rows = o.lines.map((l) => `<tr><td style="padding:6px 0">${esc(l.name)}${l.variant ? ` (${esc(l.variant)})` : ""} × ${l.qty}</td><td style="padding:6px 0;text-align:right">${inr(l.total)}</td></tr>`).join("");
  const extra = (label, v) => `<tr><td style="padding:4px 0;color:#6e625a">${label}</td><td style="padding:4px 0;text-align:right">${v}</td></tr>`;
  return `<table style="width:100%;max-width:520px;border-collapse:collapse;font:15px/1.5 Arial,sans-serif">${rows}
${extra("Delivery", o.delivery ? inr(o.delivery) : "Free")}${o.codFee ? extra("Cash on delivery", inr(o.codFee)) : ""}
<tr><td style="padding:8px 0;border-top:1px solid #ddd"><b>Total</b></td><td style="padding:8px 0;border-top:1px solid #ddd;text-align:right"><b>${inr(o.total)}</b></td></tr></table>`;
}
const address = (c) => [c.name, c.address1, c.address2, `${c.city} ${c.pincode}`, c.state, `+91 ${c.phone}`, c.email].filter(Boolean).map(esc).join("<br>");

export async function orderPlacedEmails(o, settings, origin) {
  const pay = o.payment.method === "cod" ? `Cash on delivery: collect ${inr(o.total)}` : `Paid online (PhonePe ${esc(o.payment.transactionId || "")})`;
  await send(settings.order_email, `New order ${o.id}: ${inr(o.total)}, ${o.payment.method === "cod" ? "COD" : "paid"}`,
    `<div style="font:15px/1.5 Arial,sans-serif;color:#2a1d15"><h2 style="margin:0 0 8px">New order ${esc(o.id)}</h2><p>${pay}</p>${table(o)}
<h3>Deliver to</h3><p>${address(o.customer)}</p><p><a href="${origin}/admin/orders.html">Open orders</a></p></div>`, o.customer.email || undefined);
  if (o.customer.email) {
    await send(o.customer.email, `Your Tiranga order ${o.id} is confirmed`,
      `<div style="font:15px/1.5 Arial,sans-serif;color:#2a1d15"><h2 style="margin:0 0 8px">Thank you, ${esc(o.customer.name.split(" ")[0])}.</h2>
<p>Your order <b>${esc(o.id)}</b> is placed. ${o.payment.method === "cod" ? `Please keep ${inr(o.total)} ready to pay when it arrives.` : "Your payment went through."} We'll send the tracking details when it ships.</p>
${table(o)}<h3>Delivering to</h3><p>${address(o.customer)}</p>
<p>Questions? Reply to this email or call ${esc(settings.phone || "")}.</p><p><a href="${origin}/order.html?id=${encodeURIComponent(o.id)}&k=${o.key}">View your order</a></p></div>`, settings.order_email);
  }
}

export async function orderShippedEmail(o, settings, origin) {
  if (!o.customer.email || !o.tracking?.number) return;
  const link = o.tracking.url ? `<p><a href="${esc(o.tracking.url)}">Track your parcel</a></p>` : "";
  await send(o.customer.email, `Your Tiranga order ${o.id} has shipped`,
    `<div style="font:15px/1.5 Arial,sans-serif;color:#2a1d15"><h2 style="margin:0 0 8px">It's on the way.</h2>
<p>Your order <b>${esc(o.id)}</b> has shipped with ${esc(o.tracking.courier || "our courier")}. Tracking number: <b>${esc(o.tracking.number)}</b>.</p>${link}
<p><a href="${origin}/order.html?id=${encodeURIComponent(o.id)}&k=${o.key}">View your order</a></p></div>`, settings.order_email);
}

/* ---------------- dealer orders ---------------- */
const LABEL = { new: "Received", confirmed: "Confirmed", production: "In production", ready: "Ready to dispatch", dispatched: "Dispatched", delivered: "Delivered", cancelled: "Cancelled" };
const day = (d) => (d ? new Date(d + "T00:00:00Z").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }) : "");
function tradeTable(o) {
  const rows = o.lines.map((l) => `<tr><td style="padding:6px 0;border-bottom:1px solid #eee">${esc(l.name)}</td><td style="padding:6px 0;border-bottom:1px solid #eee;text-align:right"><b>${l.qty}</b> ctn</td></tr>`).join("");
  const extra = o.extra ? `<p style="white-space:pre-line"><b>Other items:</b><br>${esc(o.extra)}</p>` : "";
  return `<table style="width:100%;max-width:560px;border-collapse:collapse;font:15px/1.5 Arial,sans-serif">${rows}</table>${extra}${o.note ? `<p><b>Note:</b> ${esc(o.note)}</p>` : ""}`;
}
const cartons = (o) => o.lines.reduce((a, l) => a + l.qty, 0);

/** A new dealer order: to the team (and a copy to the dealer if they have an email). */
export async function tradeOrderEmails(o, settings, origin, { team = true } = {}) {
  const to = process.env.TRADE_EMAIL || settings.order_email;
  const d = o.dealer;
  if (team) await send(to, `Dealer order ${o.id}: ${d.name}, ${d.city} (${cartons(o)} cartons)`,
    `<div style="font:15px/1.5 Arial,sans-serif;color:#2a1d15"><h2 style="margin:0 0 8px">New dealer order ${esc(o.id)}</h2>
<p><b>${esc(d.name)}</b>${d.ref ? ` (${esc(d.ref)})` : ""}, ${esc(d.city)}${d.phone ? ` · +91 ${esc(d.phone)}` : ""}${o.poRef ? `<br>Their reference: ${esc(o.poRef)}` : ""}</p>
${tradeTable(o)}<p><a href="${origin}/admin/trade.html">Open the dealer orders board</a></p></div>`, d.email || undefined);
  if (d.email) await send(d.email, `Order ${o.id} received`,
    `<div style="font:15px/1.5 Arial,sans-serif;color:#2a1d15"><h2 style="margin:0 0 8px">Thank you, we have your order.</h2>
<p>Order <b>${esc(o.id)}</b> for ${cartons(o)} cartons is with our team. You can follow it, and see the expected delivery date once it's confirmed, on <a href="${origin}/dealers.html">the dealer portal</a>.</p>${tradeTable(o)}</div>`, to);
}

/** The team moved the order on, set a date, sent a message or dispatched it: tell the dealer (if they have an email). */
export async function tradeUpdateEmail(o, origin) {
  const d = o.dealer;
  if (!d.email) return;
  const disp = o.dispatch || {};
  const lines = [
    `Status: <b>${LABEL[o.status] || o.status}</b>`,
    o.eta && o.status !== "delivered" && o.status !== "cancelled" ? `Expected delivery: <b>${day(o.eta)}</b>` : "",
    o.message ? `Message from our team: ${esc(o.message)}` : "",
    disp.lr ? `Dispatched${disp.transporter ? ` with ${esc(disp.transporter)}` : ""}, bilty/LR no. <b>${esc(disp.lr)}</b>${disp.vehicle ? `, vehicle ${esc(disp.vehicle)}` : ""}` : "",
  ].filter(Boolean).map((x) => `<p style="margin:4px 0">${x}</p>`).join("");
  await send(d.email, `Order ${o.id}: ${LABEL[o.status] || o.status}`,
    `<div style="font:15px/1.5 Arial,sans-serif;color:#2a1d15"><h2 style="margin:0 0 8px">Update on order ${esc(o.id)}</h2>${lines}
<p><a href="${origin}/dealers.html">See it on the dealer portal</a></p></div>`);
}
