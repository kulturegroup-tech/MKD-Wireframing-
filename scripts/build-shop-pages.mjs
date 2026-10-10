/* Checkout, order confirmation and the help pages (shipping, returns, terms, privacy, contact).
 *   content/pages/*.md  (title, description, then the text in Markdown; edited in the admin under "Help pages")
 *   -> dist/<file name>.html
 *   -> dist/checkout.html, dist/order.html */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { CONTENT, DIST, esc, readFront, markdown, listFiles } from "./lib.mjs";
import { pageShell } from "./shell.mjs";
import { readShop } from "./build-products.mjs";

const STATES = ["Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chandigarh", "Chhattisgarh",
  "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir", "Jharkhand",
  "Karnataka", "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha",
  "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal"];

export function buildShopPages() {
  const shell = pageShell();
  const shop = readShop();

  const checkout = `<main class="checkout" data-checkout>
  <div class="wrap checkout-grid">
    <form class="co-form" data-co-form novalidate>
      <a class="post-back" href="products.html">Back to the shop</a>
      <h1>Checkout</h1>
      <p class="co-preview" data-co-preview hidden>This is a preview of the checkout. Orders and payments start working once the site is live.</p>
      <fieldset>
        <legend>Contact</legend>
        <label class="field"><span>Full name</span><input name="name" autocomplete="name" required maxlength="80"></label>
        <label class="field"><span>Mobile number</span><span class="field-prefix"><i>+91</i><input name="phone" type="tel" inputmode="numeric" autocomplete="tel-national" required placeholder="10-digit mobile"></span></label>
        <label class="field"><span>Email <small>for your order confirmation</small></span><input name="email" type="email" autocomplete="email" maxlength="120" placeholder="Optional"></label>
      </fieldset>
      <fieldset>
        <legend>Delivery address</legend>
        <label class="field"><span>House, building, street</span><input name="address1" autocomplete="address-line1" required maxlength="140"></label>
        <label class="field"><span>Area, landmark <small>optional</small></span><input name="address2" autocomplete="address-line2" maxlength="140"></label>
        <div class="field-row">
          <label class="field"><span>Pincode</span><input name="pincode" inputmode="numeric" autocomplete="postal-code" required maxlength="6"></label>
          <label class="field"><span>City</span><input name="city" autocomplete="address-level2" required maxlength="60"></label>
        </div>
        <label class="field"><span>State</span><select name="state" autocomplete="address-level1" required><option value="">Choose your state</option>${STATES.map((s) => `<option>${s}</option>`).join("")}</select></label>
      </fieldset>
      <fieldset>
        <legend>Payment</legend>
        <label class="pay-opt" data-pay-online><input type="radio" name="payment" value="online" checked><span><b>Pay online</b><small>UPI, cards, netbanking and wallets, through PhonePe</small></span></label>
        <label class="pay-opt" data-pay-cod><input type="radio" name="payment" value="cod"><span><b>Cash on delivery</b><small data-cod-note>Pay when it arrives</small></span></label>
      </fieldset>
      <p class="co-error" data-co-error role="alert" hidden></p>
      <button class="btn btn-primary co-submit" type="submit" data-co-submit>Place order</button>
      <p class="co-legal">By placing this order you agree to our <a class="link" href="terms.html">terms of sale</a>. Read about <a class="link" href="shipping.html">delivery</a> and <a class="link" href="refunds.html">returns</a>.</p>
    </form>
    <aside class="co-summary" aria-labelledby="sum-title">
      <h2 id="sum-title">Your order</h2>
      <ul class="co-lines" data-co-lines></ul>
      <dl class="co-totals">
        <div><dt>Subtotal</dt><dd data-co-sub></dd></div>
        <div><dt>Delivery</dt><dd data-co-delivery></dd></div>
        <div data-co-codrow hidden><dt>Cash on delivery</dt><dd data-co-cod></dd></div>
        <div class="co-total"><dt>Total</dt><dd data-co-total></dd></div>
      </dl>
      <p class="co-free" data-co-free></p>
      <ul class="co-trust"><li>Prices include GST</li><li>${esc(shop.dispatch_note)}</li><li>${esc(shop.delivery_note)}</li></ul>
      <button class="link co-edit" type="button" data-cart-open>Edit cart</button>
    </aside>
  </div>
  <div class="wrap co-empty" data-co-empty hidden>
    <p class="dev" lang="hi">खाली</p>
    <h1>Your cart is empty</h1>
    <p class="lede">Add something from the shop and come back here to check out.</p>
    <a class="btn btn-primary" href="products.html">Visit the shop</a>
  </div>
</main>`;
  writeFileSync(join(DIST, "checkout.html"), shell({ title: "Checkout | Tiranga Agarbatti", description: "Checkout", path: "checkout.html", body: checkout, scripts: ["checkout.js"], noindex: true }));

  const order = `<main class="order-page" data-order>
  <div class="wrap order-wrap" data-order-state aria-live="polite">
    <div class="order-wait"><span class="order-spin" aria-hidden="true"></span><h1>Loading your order</h1></div>
  </div>
</main>`;
  writeFileSync(join(DIST, "order.html"), shell({ title: "Your order | Tiranga Agarbatti", description: "Your order", path: "order.html", body: order, scripts: ["checkout.js"], noindex: true }));

  // help pages
  const dir = join(CONTENT, "pages");
  const pages = [];
  for (const file of listFiles(dir, ".md")) {
    const { meta, body } = readFront(join(dir, file));
    const slug = file.replace(/\.md$/, "");
    if (!meta.title) continue;
    pages.push(slug);
    const html = `<main class="post doc">
  <header class="post-head wrap">
    <p class="post-kicker">Help</p>
    <h1>${esc(meta.title)}</h1>
    ${meta.description ? `<p class="lede">${esc(meta.description)}</p>` : ""}
  </header>
  <div class="post-body wrap">
${markdown(body, "", { breaks: true })}
  </div>
  <nav class="doc-nav wrap" aria-label="Help pages"><a href="shipping.html">Shipping &amp; delivery</a><a href="refunds.html">Returns &amp; refunds</a><a href="terms.html">Terms of sale</a><a href="privacy.html">Privacy</a><a href="contact.html">Contact us</a></nav>
</main>`;
    writeFileSync(join(DIST, `${slug}.html`), shell({ title: `${meta.title} | Tiranga Agarbatti`, description: meta.description || meta.title, path: `${slug}.html`, body: html }));
  }
  return pages;
}
