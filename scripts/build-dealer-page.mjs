/* The dealer portal: dealers sign in with the code the team gives them, order by the carton
 * and follow their orders. Behaviour in dealers.js; the server side is netlify/functions/dealer.mjs.
 *   -> dist/dealers.html */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { DIST, esc } from "./lib.mjs";
import { pageShell } from "./shell.mjs";
import { readShop } from "./build-products.mjs";

export function buildDealerPage() {
  const shell = pageShell();
  const shop = readShop();
  const tel = shop.phone.replace(/[^\d+]/g, "");

  const body = `<main class="dp" data-dp>
  <div class="wrap dp-loading" data-dp-loading><span class="order-spin" aria-hidden="true"></span></div>

  <section class="wrap dp-gate" data-dp-gate hidden aria-labelledby="dp-gate-title">
    <div class="dp-gate-copy">
      <p class="kicker">For our dealers and distributors</p>
      <h1 id="dp-gate-title">Place your orders online</h1>
      <p class="lede">Order by the carton or jhola, or fill a whole truck, at any hour, without waiting on a call. Follow every order from confirmation to production to dispatch, with the date it should reach you.</p>
      <ul class="dp-points">
        <li><b>Order in a minute</b><span>Pick from the full Tiranga and Sacred range, or paste the list you would read out on the phone.</span></li>
        <li><b>Know where it is</b><span>Each order shows its stage, the expected delivery date and the bilty number once it ships.</span></li>
        <li><b>Order again</b><span>Repeat a past order in one tap, then change what you need.</span></li>
      </ul>
    </div>
    <form class="dp-login" data-dp-login novalidate>
      <h2>Dealer sign in</h2>
      <label class="field"><span>Your dealer code</span><input name="code" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="20" placeholder="For example TK7M-4QPX" required></label>
      <p class="co-error" data-dp-login-error role="alert" hidden></p>
      <button class="btn btn-primary co-submit" type="submit">Sign in</button>
      <p class="dp-help">No code yet? Ask your sales officer, or call <a href="tel:${esc(tel)}">${esc(shop.phone)}</a>.</p>
      <p class="dp-help">Want to stock Tiranga and Sacred? <a class="link" href="index.html#partner">Become a distributor</a></p>
    </form>
  </section>

  <section class="dp-app" data-dp-app hidden>
    <div class="dp-top">
      <div class="wrap dp-top-inner">
        <div class="dp-who">
          <p class="dp-hello">Namaste<span data-dp-contact></span></p>
          <h1 data-dp-firm></h1>
          <p class="dp-meta" data-dp-meta></p>
        </div>
        <div class="dp-tabs" role="tablist" aria-label="Dealer portal">
          <button type="button" role="tab" aria-selected="true" data-dp-tab="new">New order</button>
          <button type="button" role="tab" aria-selected="false" data-dp-tab="orders">My orders<small data-dp-active-count hidden></small></button>
        </div>
        <button class="dp-out" type="button" data-dp-logout>Sign out</button>
      </div>
    </div>

    <p class="wrap dp-flash" data-dp-flash role="status" hidden></p>

    <div class="wrap dp-panel" data-dp-panel="new" role="tabpanel">
      <div class="dp-new">
        <div class="dp-picker">
          <div class="dp-tools">
            <label class="catalog-search dp-search"><span class="sr-only">Search products</span><input type="search" placeholder="Search, e.g. mogra or loban" autocomplete="off" data-dp-search></label>
            <div class="brand-toggle" role="group" aria-label="Brand" data-dp-brands>
              <button type="button" aria-pressed="true" data-brand="all">Both</button>
              <button type="button" aria-pressed="false" data-brand="Tiranga">Tiranga</button>
              <button type="button" aria-pressed="false" data-brand="Sacred">Sacred</button>
            </div>
            <button class="btn btn-ghost dp-paste-open" type="button" data-dp-paste-open>Paste a list</button>
          </div>
          <div class="dp-cats" role="group" aria-label="Category" data-dp-cats></div>
          <p class="dp-count" data-dp-count aria-live="polite"></p>
          <ul class="dp-list" data-dp-list></ul>
          <p class="dp-none" data-dp-none hidden>Nothing matches. Write it under “Other items” in your order and we'll take care of it.</p>
        </div>

        <aside class="dp-cart" data-dp-cart aria-labelledby="dp-cart-title">
          <section class="tl" data-tl aria-labelledby="tl-title" hidden>
            <div class="tl-head">
              <div><h2 id="tl-title">Truck load</h2><p class="tl-sub" data-tl-sub></p></div>
              <p class="tl-pct" data-tl-pct aria-live="polite"><b>0</b><small>%</small></p>
            </div>
            <div class="tl-stage" data-tl-stage></div>
            <div class="tl-meter" data-tl-meter aria-hidden="true"><i class="c"></i><i class="j"></i></div>
            <p class="tl-note" data-tl-note></p>
            <div class="tl-pick" role="radiogroup" aria-label="Truck size" data-tl-pick></div>
            <p class="tl-legend"><span class="c">Cartons</span><span class="j">Jholas</span><span class="tl-other" data-tl-other hidden>Other items aren't counted in the load</span></p>
          </section>
          <h2 id="dp-cart-title">Your order</h2>
          <p class="dp-cart-empty" data-dp-cart-empty>Add cartons from the list, or paste your usual order.</p>
          <ul class="dp-lines" data-dp-lines></ul>
          <label class="field"><span>Other items <small>not on the list</small></span><textarea rows="3" maxlength="1500" placeholder="For example: Tiranga T5, 50 cartons" data-dp-extra></textarea></label>
          <label class="field"><span>Your reference <small>optional</small></span><input maxlength="40" placeholder="Your PO or bill number" data-dp-po></label>
          <label class="field"><span>Note for our team <small>optional</small></span><textarea rows="2" maxlength="800" placeholder="Delivery instructions, urgency" data-dp-note></textarea></label>
          <div class="dp-total"><span>Total</span><b data-dp-total>0 cartons</b></div>
          <p class="co-error" data-dp-error role="alert" hidden></p>
          <button class="btn btn-primary co-submit" type="button" data-dp-place>Place order</button>
          <p class="co-legal">No payment now. Our team confirms your order and bills you as usual.</p>
        </aside>
      </div>
      <div class="dp-mbar" data-dp-mbar hidden><span class="dp-mbar-truck" data-dp-mbar-truck hidden></span><span data-dp-mbar-text></span><button class="btn btn-primary" type="button" data-dp-review>Review order</button></div>
    </div>

    <div class="wrap dp-panel" data-dp-panel="orders" role="tabpanel" hidden>
      <div class="dp-orders" data-dp-orders></div>
    </div>
  </section>
</main>

<dialog class="dp-paste" data-dp-paste aria-labelledby="dp-paste-title">
  <form method="dialog" class="dp-paste-inner">
    <div class="dp-paste-head"><h2 id="dp-paste-title">Paste your list</h2><button class="dp-x" value="cancel" aria-label="Close">×</button></div>
    <p class="dp-paste-hint">One item per line, with the number of cartons, the way you'd say it on the phone or send it on WhatsApp.</p>
    <textarea rows="7" data-dp-paste-text placeholder="Tiranga Mogra 20 g - 50&#10;Asim Loban 10 cartons&#10;Sacred Gugal jar 200 g x 20"></textarea>
    <button class="btn btn-ghost" type="button" data-dp-paste-match>Find these products</button>
    <div class="dp-paste-results" data-dp-paste-results hidden></div>
    <div class="dp-paste-foot" data-dp-paste-foot hidden><button class="btn btn-primary" type="button" data-dp-paste-add>Add to my order</button></div>
  </form>
</dialog>`;

  writeFileSync(join(DIST, "dealers.html"), shell({
    title: "Dealer orders | Maa Kamakhya Darbar Fragrances",
    description: "Dealers and distributors of Tiranga and Sacred: place your orders online by the carton and follow them to delivery.",
    path: "dealers.html", body, current: "dealers.html", scripts: ["truck.js", "dealers.js"],
  }));
}
