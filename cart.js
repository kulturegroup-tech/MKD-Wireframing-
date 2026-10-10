/* The cart: kept in this browser, shown in a drawer from the header, used by every page.
 *   [data-cart-open]        opens the drawer (the bag button in the header)
 *   [data-add-id="<id>"]    adds one of that product (cards on the shop page)
 *   [data-pdp]              a product page: pack picker, quantity, Add to cart, Buy now
 * Prices shown here come from products.json; the checkout re-checks every price on the server. */
(function () {
  "use strict";
  var script = document.currentScript;
  var BASE = script && script.src ? script.src.replace(/cart\.js(\?.*)?$/, "") : "";
  var KEY = "tiranga-cart-v1";
  var MAX_QTY = 50;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var inr = function (n) { return "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 }); };

  /* ---------- storage (falls back to memory when the browser blocks it) ---------- */
  var memory = [];
  function read() {
    try { var v = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(v) ? v : []; } catch (e) { return memory.slice(); }
  }
  function write(items) {
    memory = items.slice();
    try { localStorage.setItem(KEY, JSON.stringify(items)); } catch (e) { /* private mode: memory only */ }
    changed();
  }
  var keyOf = function (it) { return it.id + "|" + (it.v || ""); };

  /* ---------- catalogue ---------- */
  var catalogP = null;
  function catalog() {
    if (!catalogP) {
      catalogP = Promise.all([
        fetch(BASE + "products.json", { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }),
        fetch(BASE + "shop.json", { cache: "no-cache" }).then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; }),
      ]).then(function (res) {
        var byId = {};
        res[0].products.forEach(function (p) { byId[p.id] = p; });
        return { products: res[0].products, byId: byId, shop: res[1] || {} };
      });
      catalogP.catch(function () { catalogP = null; });
    }
    return catalogP;
  }
  /** cart items joined with the catalogue: what to show and what it costs */
  function lines(cat) {
    return read().map(function (it) {
      var p = cat.byId[it.id];
      var v = p && p.variants.filter(function (x) { return x.label === (it.v || ""); })[0];
      var ok = !!(p && v && v.inStock);
      return {
        key: keyOf(it), id: it.id, v: it.v || "", qty: it.q, ok: ok,
        name: p ? p.name : "This product", variant: v ? v.label : (it.v || ""), price: v ? v.price : 0,
        image: p && p.image ? BASE + p.image : "", pack: p && p.pack, url: p ? BASE + p.url : "#",
        total: ok ? v.price * it.q : 0,
      };
    });
  }
  function totals(cat, ls, payment) {
    var shop = cat.shop || {};
    var sub = ls.reduce(function (a, l) { return a + l.total; }, 0);
    var free = shop.free_delivery_above != null ? +shop.free_delivery_above : 499;
    var delivery = sub === 0 || sub >= free ? 0 : +(shop.delivery_fee != null ? shop.delivery_fee : 49);
    var cod = payment === "cod" ? +(shop.cod_fee || 0) : 0;
    return { sub: sub, delivery: delivery, cod: cod, total: sub + delivery + cod, free: free, toFree: Math.max(0, free - sub) };
  }

  /* ---------- changing the cart ---------- */
  function add(id, variant, qty) {
    qty = Math.max(1, Math.min(MAX_QTY, parseInt(qty, 10) || 1));
    var items = read(), k = id + "|" + (variant || "");
    var found = items.filter(function (it) { return keyOf(it) === k; })[0];
    if (found) found.q = Math.min(MAX_QTY, found.q + qty); else items.push({ id: id, v: variant || "", q: qty });
    write(items);
  }
  function setQty(k, q) {
    var items = read().map(function (it) { if (keyOf(it) === k) it.q = Math.max(0, Math.min(MAX_QTY, q)); return it; })
      .filter(function (it) { return it.q > 0; });
    write(items);
  }
  function remove(k) { write(read().filter(function (it) { return keyOf(it) !== k; })); }
  function clear() { write([]); }

  /* ---------- header count ---------- */
  function changed() {
    var n = read().reduce(function (a, it) { return a + it.q; }, 0);
    $$("[data-cart-count]").forEach(function (el) { el.textContent = n; el.hidden = n === 0; });
    $$("[data-cart-open]").forEach(function (b) { b.setAttribute("aria-label", n ? "Open cart, " + n + (n === 1 ? " item" : " items") : "Open cart, empty"); });
    if (drawer && drawer.open) renderDrawer();
    document.dispatchEvent(new CustomEvent("cart:change"));
  }
  window.addEventListener("storage", function (e) { if (e.key === KEY) changed(); });

  /* ---------- drawer ---------- */
  var drawer = null, lastAdded = "";
  function ensureDrawer() {
    if (drawer) return drawer;
    drawer = document.createElement("dialog");
    drawer.className = "cart";
    drawer.setAttribute("aria-labelledby", "cart-title");
    drawer.innerHTML =
      '<div class="cart-panel">' +
      '<header class="cart-head"><h2 id="cart-title">Your cart</h2><button class="cart-close" type="button" data-cart-close aria-label="Close cart">×</button></header>' +
      '<div class="cart-ship" data-cart-ship></div>' +
      '<ul class="cart-lines" data-cart-lines></ul>' +
      '<div class="cart-empty" data-cart-empty hidden><p class="dev" lang="hi">खाली</p><p>Your cart is empty.</p><a class="btn btn-primary" href="' + BASE + 'products.html">Visit the shop</a></div>' +
      '<footer class="cart-foot" data-cart-foot><div class="cart-sub"><span>Subtotal</span><b data-cart-sub></b></div>' +
      '<p class="cart-note">Delivery and payment options at checkout. Prices include GST.</p>' +
      '<a class="btn btn-primary cart-checkout" href="' + BASE + 'checkout.html">Checkout</a>' +
      '<button class="cart-continue" type="button" data-cart-close>Continue shopping</button></footer>' +
      "</div>";
    document.body.appendChild(drawer);
    drawer.addEventListener("click", function (e) {
      if (e.target === drawer || e.target.closest("[data-cart-close]")) { drawer.close(); return; }
      var step = e.target.closest("[data-line-step]");
      if (step) { var l = step.closest("[data-line]"); setQty(l.getAttribute("data-line"), +l.getAttribute("data-qty") + +step.getAttribute("data-line-step")); return; }
      var rm = e.target.closest("[data-line-remove]");
      if (rm) remove(rm.closest("[data-line]").getAttribute("data-line"));
    });
    return drawer;
  }
  function renderDrawer() {
    catalog().then(function (cat) {
      var ls = lines(cat), t = totals(cat, ls);
      var list = $("[data-cart-lines]", drawer);
      list.innerHTML = ls.map(function (l) {
        return '<li class="cart-line' + (l.key === lastAdded ? " is-new" : "") + (l.ok ? "" : " is-gone") + '" data-line="' + esc(l.key) + '" data-qty="' + l.qty + '">' +
          '<a class="cart-thumb' + (l.pack ? " is-pack" : "") + '" href="' + esc(l.url) + '">' + (l.image ? '<img src="' + esc(l.image) + '" alt="">' : "") + "</a>" +
          '<div class="cart-line-info"><a class="cart-line-name" href="' + esc(l.url) + '">' + esc(l.name) + "</a>" +
          (l.variant ? '<span class="cart-line-variant">' + esc(l.variant) + "</span>" : "") +
          (l.ok ? '<span class="cart-line-each">' + inr(l.price) + " each</span>" : '<span class="cart-line-gone">Not available right now</span>') +
          (l.ok ? '<div class="qty qty-sm"><button type="button" data-line-step="-1" aria-label="One less">−</button><span aria-live="polite">' + l.qty + '</span><button type="button" data-line-step="1" aria-label="One more">+</button></div>' : "") +
          "</div>" +
          '<div class="cart-line-end">' + (l.ok ? "<b>" + inr(l.total) + "</b>" : "") + '<button class="cart-remove" type="button" data-line-remove>Remove</button></div></li>';
      }).join("");
      var has = ls.length > 0;
      $("[data-cart-empty]", drawer).hidden = has;
      $("[data-cart-foot]", drawer).hidden = !has;
      $("[data-cart-sub]", drawer).textContent = inr(t.sub);
      var ship = $("[data-cart-ship]", drawer);
      ship.hidden = !has || !t.sub;
      var pct = Math.min(100, Math.round((t.sub / (t.free || 1)) * 100));
      ship.innerHTML = t.toFree > 0
        ? "<p>Add <b>" + inr(t.toFree) + "</b> more for free delivery</p><span class=\"cart-meter\"><i style=\"width:" + pct + '%"></i></span>'
        : '<p><b>Free delivery</b> on this order</p><span class="cart-meter is-full"><i style="width:100%"></i></span>';
      $(".cart-checkout", drawer).classList.toggle("is-disabled", !ls.some(function (l) { return l.ok; }));
    }).catch(function () {
      $("[data-cart-lines]", drawer).innerHTML = '<li class="cart-line"><p>We couldn’t load the cart. Please refresh the page.</p></li>';
    });
  }
  function open() {
    ensureDrawer(); renderDrawer();
    if (!drawer.open) { if (typeof drawer.showModal === "function") drawer.showModal(); else drawer.setAttribute("open", ""); }
  }

  document.addEventListener("click", function (e) {
    var o = e.target.closest("[data-cart-open]");
    if (o) { e.preventDefault(); lastAdded = ""; open(); return; }
    var a = e.target.closest("[data-add-id]");
    if (a) {
      e.preventDefault();
      var id = a.getAttribute("data-add-id");
      catalog().then(function (cat) {
        var p = cat.byId[id], v = p && p.variants.filter(function (x) { return x.inStock; })[0];
        if (!p || !v) return;
        add(id, v.label, 1); lastAdded = id + "|" + v.label; open();
      });
    }
  });

  /* ---------- product page ---------- */
  var pdp = $("[data-pdp]");
  if (pdp) {
    var info = JSON.parse(($("[data-pdp-json]") || {}).textContent || "{}");
    var qtyInput = $("[data-qty-input]", pdp), priceEl = $("[data-pdp-price]", pdp);
    var addBtn = $("[data-pdp-add]", pdp), nowBtn = $("[data-pdp-now]", pdp);
    var current = function () {
      var r = $('input[name="variant"]:checked', pdp);
      var vs = info.variants || [];
      return r ? vs[+r.value] : vs.filter(function (v) { return v.inStock; })[0] || vs[0];
    };
    var showVariant = function () {
      var v = current(); if (!v || !priceEl) return;
      var off = v.mrp ? Math.round((1 - v.price / v.mrp) * 100) : 0;
      priceEl.innerHTML = "<b>" + inr(v.price) + "</b>" + (v.mrp ? " <s>MRP " + inr(v.mrp) + '</s> <span class="pdp-off">' + off + "% off</span>" : "");
      if (addBtn) { addBtn.disabled = !v.inStock; addBtn.textContent = v.inStock ? "Add to cart" : "Sold out"; }
      if (nowBtn) nowBtn.hidden = !v.inStock;
    };
    $$('input[name="variant"]', pdp).forEach(function (r) { r.addEventListener("change", showVariant); });
    $$("[data-qty-step]", pdp).forEach(function (b) {
      b.addEventListener("click", function () {
        qtyInput.value = Math.max(1, Math.min(MAX_QTY, (parseInt(qtyInput.value, 10) || 1) + +b.getAttribute("data-qty-step")));
      });
    });
    if (qtyInput) qtyInput.addEventListener("change", function () { qtyInput.value = Math.max(1, Math.min(MAX_QTY, parseInt(qtyInput.value, 10) || 1)); });
    var addCurrent = function () {
      var v = current(); if (!v || !v.inStock) return false;
      add(info.id, v.label, qtyInput ? qtyInput.value : 1); lastAdded = info.id + "|" + v.label; return true;
    };
    if (addBtn) addBtn.addEventListener("click", function () { if (addCurrent()) open(); });
    if (nowBtn) nowBtn.addEventListener("click", function () { if (addCurrent()) location.href = BASE + "checkout.html"; });
    // photo gallery
    var main = $("[data-pdp-main]", pdp);
    $$("[data-pdp-thumb]", pdp).forEach(function (b) {
      b.addEventListener("click", function () {
        main.src = b.getAttribute("data-pdp-thumb");
        $$("[data-pdp-thumb]", pdp).forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
      });
    });
  }

  window.TirangaCart = { base: BASE, read: read, add: add, setQty: setQty, remove: remove, clear: clear, open: open, catalog: catalog, lines: lines, totals: totals, inr: inr, esc: esc };
  changed();
})();
