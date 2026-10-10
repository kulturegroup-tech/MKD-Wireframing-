/* Checkout (checkout.html) and the order confirmation (order.html).
 * The order is placed by /api/checkout (netlify/functions/checkout.mjs), which re-prices everything on the server,
 * saves the order and, for online payment, sends the customer to PhonePe. PhonePe brings them back to order.html. */
(function () {
  "use strict";
  var C = window.TirangaCart;
  if (!C) return;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = C.esc, inr = C.inr, BASE = C.base;
  var SAVED = "tiranga-customer-v1";

  function api(path, opts) {
    return fetch(BASE + "api/" + path, opts).then(function (r) {
      var type = r.headers.get("content-type") || "";
      if (type.indexOf("json") < 0) throw new Error("offline");
      return r.json().then(function (j) { j.httpStatus = r.status; return j; });
    });
  }

  /* ================= checkout ================= */
  var co = $("[data-checkout]");
  if (co) {
    var form = $("[data-co-form]", co), errBox = $("[data-co-error]", co), submit = $("[data-co-submit]", co);
    var methods = { online: true, cod: true }, preview = false, cat = null;

    // fill in details saved from the last order on this device
    try {
      var saved = JSON.parse(localStorage.getItem(SAVED) || "null");
      if (saved) Object.keys(saved).forEach(function (k) { var f = form.elements[k]; if (f && !f.value && typeof saved[k] === "string") f.value = saved[k]; });
    } catch (e) { /* ignore */ }

    var payment = function () { var r = form.querySelector('input[name="payment"]:checked'); return r ? r.value : "online"; };

    function render() {
      if (!cat) return;
      var ls = C.lines(cat).filter(function (l) { return l.ok; });
      $("[data-co-empty]", co).hidden = ls.length > 0;
      $(".checkout-grid", co).hidden = ls.length === 0;
      var t = C.totals(cat, ls, payment());
      $("[data-co-lines]", co).innerHTML = ls.map(function (l) {
        return '<li><span class="co-thumb' + (l.pack ? " is-pack" : "") + '">' + (l.image ? '<img src="' + esc(l.image) + '" alt="">' : "") + "<i>" + l.qty + "</i></span>" +
          '<span class="co-line-name">' + esc(l.name) + (l.variant ? "<small>" + esc(l.variant) + "</small>" : "") + "</span><b>" + inr(l.total) + "</b></li>";
      }).join("");
      $("[data-co-sub]", co).textContent = inr(t.sub);
      $("[data-co-delivery]", co).textContent = t.delivery ? inr(t.delivery) : "Free";
      $("[data-co-codrow]", co).hidden = !t.cod;
      $("[data-co-cod]", co).textContent = inr(t.cod);
      $("[data-co-total]", co).textContent = inr(t.total);
      $("[data-co-free]", co).textContent = t.delivery ? "Add " + inr(t.toFree) + " more for free delivery." : "";
      // COD: switched off in settings, or over the COD limit
      var shop = cat.shop || {}, codRow = $("[data-pay-cod]", co), codInput = $('input[value="cod"]', co);
      var codMax = shop.cod_max ? +shop.cod_max : 0, overMax = codMax && t.sub + t.delivery > codMax;
      var codOn = methods.cod && shop.cod_enabled !== false && !overMax;
      codRow.hidden = !(methods.cod && shop.cod_enabled !== false);
      codInput.disabled = !codOn;
      $("[data-cod-note]", co).textContent = overMax ? "Available on orders up to " + inr(codMax)
        : (shop.cod_fee ? inr(shop.cod_fee) + " extra. Pay in cash or UPI when it arrives." : "Pay in cash or UPI when it arrives.");
      var onlineRow = $("[data-pay-online]", co);
      onlineRow.hidden = !methods.online || shop.online_enabled === false;
      if (codInput.checked && !codOn) { var on = $('input[value="online"]', co); if (on) on.checked = true; }
      if (onlineRow.hidden && codOn) codInput.checked = true;
      submit.textContent = payment() === "cod" ? "Place order, " + inr(t.total) : "Pay " + inr(t.total);
    }

    C.catalog().then(function (c) { cat = c; render(); }).catch(function () { showError("We couldn’t load your cart. Please refresh the page."); });
    document.addEventListener("cart:change", render);
    form.addEventListener("change", function (e) { if (e.target.name === "payment") render(); });
    form.addEventListener("input", function (e) {
      var f = e.target.closest(".field");
      if (f && f.classList.contains("is-bad")) { f.classList.remove("is-bad"); errBox.hidden = true; }
    });

    // which payment methods are switched on (also tells us if this is a preview without the server)
    api("checkout").then(function (j) { methods = { online: !!j.online, cod: !!j.cod }; render(); })
      .catch(function () { preview = true; $("[data-co-preview]", co).hidden = false; });

    // pincode -> city and state (India Post lookup; quietly skipped if it isn't reachable)
    var pin = form.elements.pincode;
    pin.addEventListener("input", function () {
      pin.value = pin.value.replace(/\D/g, "").slice(0, 6);
      if (pin.value.length !== 6) return;
      fetch("https://api.postalpincode.in/pincode/" + pin.value).then(function (r) { return r.json(); }).then(function (j) {
        var po = j && j[0] && j[0].PostOffice && j[0].PostOffice[0];
        if (!po) return;
        if (!form.elements.city.value) form.elements.city.value = po.District;
        var st = form.elements.state, opt = $$("option", st).filter(function (o) { return o.value.toLowerCase() === String(po.State).toLowerCase(); })[0];
        if (opt && !st.value) st.value = opt.value;
      }).catch(function () { /* fine, they type it */ });
    });
    form.elements.phone.addEventListener("input", function () { this.value = this.value.replace(/\D/g, "").replace(/^(91|0)(?=\d{10})/, "").slice(0, 10); });

    function showError(msg, field) {
      errBox.textContent = msg; errBox.hidden = !msg;
      $$(".field.is-bad", form).forEach(function (f) { f.classList.remove("is-bad"); });
      if (field && form.elements[field]) {
        var f = form.elements[field].closest(".field"); if (f) f.classList.add("is-bad");
        form.elements[field].focus();
      }
    }
    function check() {
      var e = form.elements;
      if (!e.name.value.trim()) return ["Please enter your name.", "name"];
      if (!/^[6-9]\d{9}$/.test(e.phone.value)) return ["Please enter a 10-digit mobile number.", "phone"];
      if (e.email.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.email.value)) return ["Please check your email address.", "email"];
      if (!e.address1.value.trim()) return ["Please enter your house, building and street.", "address1"];
      if (!/^[1-9]\d{5}$/.test(e.pincode.value)) return ["Please enter a 6-digit pincode.", "pincode"];
      if (!e.city.value.trim()) return ["Please enter your city.", "city"];
      if (!e.state.value) return ["Please choose your state.", "state"];
      return null;
    }

    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var bad = check();
      if (bad) { showError(bad[0], bad[1]); return; }
      if (preview) { showError("This is a preview. Orders and payments start working once the site is live."); return; }
      showError("");
      var e = form.elements;
      var customer = { name: e.name.value.trim(), phone: e.phone.value, email: e.email.value.trim(), address1: e.address1.value.trim(), address2: e.address2.value.trim(), pincode: e.pincode.value, city: e.city.value.trim(), state: e.state.value };
      var items = C.read().map(function (it) { return { id: it.id, variant: it.v || "", qty: it.q }; });
      submit.disabled = true; submit.classList.add("is-busy");
      var label = submit.textContent; submit.textContent = payment() === "cod" ? "Placing your order…" : "Taking you to PhonePe…";
      api("checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: items, customer: customer, payment: payment() }) })
        .then(function (j) {
          if (!j.ok) throw j;
          try { localStorage.setItem(SAVED, JSON.stringify(customer)); } catch (x) { /* ignore */ }
          location.href = j.redirect;
        })
        .catch(function (j) {
          submit.disabled = false; submit.classList.remove("is-busy"); submit.textContent = label;
          if (j && j.error) {
            showError(j.error, j.field);
            if (j.refresh) { C.catalog().then(function (c) { cat = c; render(); }); }
          } else {
            showError("We couldn’t reach our server. Please check your connection and try again.");
          }
        });
    });
  }

  /* ================= order confirmation ================= */
  var op = $("[data-order]");
  if (op) {
    var q = new URLSearchParams(location.search), id = q.get("id") || "", k = q.get("k") || "";
    var box = $("[data-order-state]", op), tries = 0;
    var shopP = C.catalog().then(function (c) { return c.shop || {}; }).catch(function () { return {}; });

    function addr(c) {
      return [c.name, c.address1, c.address2, c.city + " " + c.pincode, c.state, "+91 " + c.phone].filter(Boolean).map(esc).join("<br>");
    }
    function summary(o) {
      return '<ul class="co-lines">' + o.lines.map(function (l) {
        return '<li><span class="co-thumb">' + (l.image ? '<img src="' + esc(BASE + l.image) + '" alt="">' : "") + "<i>" + l.qty + "</i></span>" +
          '<span class="co-line-name">' + esc(l.name) + (l.variant ? "<small>" + esc(l.variant) + "</small>" : "") + "</span><b>" + inr(l.total) + "</b></li>";
      }).join("") + "</ul>" +
        '<dl class="co-totals"><div><dt>Subtotal</dt><dd>' + inr(o.subtotal) + "</dd></div><div><dt>Delivery</dt><dd>" + (o.delivery ? inr(o.delivery) : "Free") + "</dd></div>" +
        (o.codFee ? "<div><dt>Cash on delivery</dt><dd>" + inr(o.codFee) + "</dd></div>" : "") +
        '<div class="co-total"><dt>Total</dt><dd>' + inr(o.total) + "</dd></div></dl>";
    }
    function show(o, shop) {
      var paid = o.payment.state === "paid", cod = o.payment.method === "cod";
      var wa = shop.whatsapp ? '<a class="link" href="https://wa.me/' + esc(shop.whatsapp) + "?text=" + encodeURIComponent("Hi, about my order " + o.id) + '" target="_blank" rel="noopener">WhatsApp us</a>' : "";
      if (paid || cod) {
        C.clear();
        box.innerHTML = '<div class="order-ok"><span class="order-tick" aria-hidden="true"></span>' +
          '<p class="order-kicker">Order ' + esc(o.id) + "</p><h1>Thank you, " + esc(o.customer.name.split(" ")[0]) + ".</h1>" +
          "<p class=\"lede\">" + (cod ? "Your order is placed. Please keep " + inr(o.total) + " ready to pay when it arrives." : "Your payment went through and your order is placed.") +
          " We’ll send the tracking details when it ships" + (o.customer.email ? " to " + esc(o.customer.email) : "") + ".</p></div>" +
          '<div class="order-cols"><section><h2>Delivering to</h2><p>' + addr(o.customer) + "</p>" +
          "<h2>Payment</h2><p>" + (cod ? "Cash on delivery" : "Paid online through PhonePe") + "</p>" +
          (o.tracking && o.tracking.number ? "<h2>Tracking</h2><p>" + esc(o.tracking.courier || "") + " " + esc(o.tracking.number) + "</p>" : "") +
          "<p class=\"order-help\">Questions about this order? " + (wa ? wa + " or call " : "Call ") + esc(shop.phone || "") + ".</p></section>" +
          "<section><h2>Your order</h2>" + summary(o) + "</section></div>" +
          '<p class="order-next"><a class="btn btn-primary" href="' + BASE + 'products.html">Continue shopping</a></p>';
        return;
      }
      if (o.payment.state === "review") {
        C.clear();
        box.innerHTML = '<div class="order-wait"><p class="order-kicker">Order ' + esc(o.id) + '</p><h1>We’ve received your payment</h1><p class="lede">We’re confirming the amount with PhonePe and will be in touch shortly. ' + (wa ? wa + " if you have a question." : "") + "</p></div>";
        return;
      }
      if (o.payment.state === "pending" && tries < 12) {
        box.innerHTML = '<div class="order-wait"><span class="order-spin" aria-hidden="true"></span><h1>Confirming your payment</h1><p class="lede">This takes a few seconds. Please don’t close this page.</p></div>';
        tries++; setTimeout(load, 3000); return;
      }
      if (o.payment.state === "pending") {
        box.innerHTML = '<div class="order-wait"><h1>Your payment is still processing</h1><p class="lede">PhonePe hasn’t confirmed it yet. If money left your account, the order will confirm on its own and you’ll hear from us. You can refresh this page in a minute.</p>' +
          '<p class="order-next"><button class="btn btn-primary" type="button" onclick="location.reload()">Check again</button></p></div>';
        return;
      }
      box.innerHTML = '<div class="order-fail"><p class="order-kicker">Order ' + esc(o.id) + "</p><h1>The payment didn’t go through</h1>" +
        '<p class="lede">Your order isn’t placed and nothing was charged. If money did leave your account, your bank returns it within 5 to 7 working days. Your cart is still saved.</p>' +
        '<p class="order-next"><a class="btn btn-primary" href="' + BASE + 'checkout.html">Try again</a> ' + (wa ? "<span>or " + wa + "</span>" : "") + "</p></div>";
    }
    function load() {
      Promise.all([api("order?id=" + encodeURIComponent(id) + "&k=" + encodeURIComponent(k)), shopP]).then(function (r) {
        var j = r[0];
        if (!j.ok) throw j;
        show(j.order, r[1]);
      }).catch(function (j) {
        box.innerHTML = '<div class="order-fail"><h1>We couldn’t find this order</h1><p class="lede">' +
          esc(j && j.error ? j.error : "Please check the link, or contact us with your order number.") + "</p>" +
          '<p class="order-next"><a class="btn btn-primary" href="' + BASE + 'contact.html">Contact us</a></p></div>';
      });
    }
    if (id) load(); else box.innerHTML = '<div class="order-fail"><h1>No order to show</h1><p class="lede">Open the link from your order confirmation.</p></div>';
  }
})();
