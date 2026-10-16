/* Dealer portal (dealers.html): sign in with the dealer code, order by the carton, follow orders.
 * Talks to /api/dealer/* (netlify/functions/dealer.mjs). The list of products is trade.json, built from the products. */
(function () {
  "use strict";
  var root = document.querySelector("[data-dp]");
  if (!root) return;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} },
  };
  var TOKEN = "mkd-dealer-pass";
  var STAGES = ["new", "confirmed", "production", "ready", "dispatched", "delivered"];
  var LABEL = { new: "Received", confirmed: "Confirmed", production: "In production", ready: "Ready to dispatch", dispatched: "Dispatched", delivered: "Delivered", cancelled: "Cancelled" };

  var state = { token: store.get(TOKEN), dealer: null, orders: [], catalog: { items: [], categories: [], trucks: [] }, byId: {}, cat: "all", brand: "all", q: "", qty: {}, tab: "new", truck: "" };
  var fmt = function (n) { return Number(n).toLocaleString("en-IN"); };
  var UNIT = { carton: ["carton", "cartons", "ctn"], jhola: ["jhola", "jholas", "jhola"] };
  function unitOf(x) { return x && x.unit === "jhola" ? "jhola" : "carton"; }
  function unitWord(u, n) { return n === 1 ? UNIT[u][0] : UNIT[u][1]; }
  function amounts(t) {
    var parts = [];
    if (t.c) parts.push(fmt(t.c) + " " + unitWord("carton", t.c));
    if (t.j) parts.push(fmt(t.j) + " " + unitWord("jhola", t.j));
    return parts.join(" + ") || "0 cartons";
  }
  function lineTotals(ls) { var t = { c: 0, j: 0 }; ls.forEach(function (l) { if (unitOf(l.item || l) === "jhola") t.j += l.qty; else t.c += l.qty; }); return t; }

  var PHONE = (function () { var a = document.querySelector('.dp-help a[href^="tel:"]'); return a ? a.textContent : ""; })();
  /* every reply is read as text first, so a server hiccup shows a clear message instead of "can't reach the server" */
  function readReply(r) {
    return r.text().then(function (t) {
      var j = null; try { j = JSON.parse(t); } catch (e) {}
      if (!j || typeof j !== "object") j = { ok: false };
      if (!j.ok && !j.error) j.error = r.status >= 500 ? "The dealer portal is having a problem right now. Please try again in a few minutes" + (PHONE ? ", or call us on " + PHONE : "") + "." : "Something went wrong. Please try again.";
      j.status = r.status;
      return j;
    });
  }
  function api(path, body) {
    return fetch("api/dealer/" + path, {
      method: body ? "POST" : "GET",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + (state.token || "") },
      body: body ? JSON.stringify(body) : undefined,
    }).then(readReply).then(function (j) {
      if (j.status === 401 && j.signin) { signOut("Please sign in again."); throw new Error("signin"); }
      return j;
    });
  }

  /* ---------- dates ---------- */
  function day(iso) {
    if (!iso) return "";
    var d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
  }
  function when(ts) {
    var d = new Date(ts);
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) + ", " + d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  }
  function daysFromToday(iso) {
    var t = new Date(); t.setHours(0, 0, 0, 0);
    return Math.round((new Date(iso + "T00:00:00") - t) / 86400000);
  }

  /* ---------- views ---------- */
  function show(view) {
    $("[data-dp-loading]").hidden = view !== "loading";
    $("[data-dp-gate]").hidden = view !== "gate";
    $("[data-dp-app]").hidden = view !== "app";
  }
  function flash(msg) {
    var f = $("[data-dp-flash]");
    f.innerHTML = msg; f.hidden = !msg;
    if (msg) window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ---------- sign in ---------- */
  var loginForm = $("[data-dp-login]");
  loginForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var input = loginForm.code, err = $("[data-dp-login-error]"), btn = $("button[type=submit]", loginForm);
    var code = input.value.trim();
    err.hidden = true; input.closest(".field").classList.remove("is-bad");
    if (code.replace(/[^a-z0-9]/gi, "").length < 6) { err.textContent = "Please enter the dealer code we gave you."; err.hidden = false; input.focus(); return; }
    btn.disabled = true; btn.textContent = "Signing in";
    fetch("api/dealer/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: code }) })
      .then(readReply)
      .then(function (j) {
        if (!j.ok) { err.textContent = j.error; err.hidden = false; if (j.field) { input.closest(".field").classList.add("is-bad"); input.select(); } return; }
        state.token = j.token; store.set(TOKEN, j.token);
        input.value = "";
        start();
      })
      .catch(function () { err.textContent = navigator.onLine === false ? "You seem to be offline. Please check your internet and try again." : "We couldn't reach the server. Please try again in a moment."; err.hidden = false; })
      .then(function () { btn.disabled = false; btn.textContent = "Sign in"; });
  });
  loginForm.code.addEventListener("input", function () { loginForm.code.closest(".field").classList.remove("is-bad"); $("[data-dp-login-error]").hidden = true; });

  function signOut(msg) {
    state.token = null; state.dealer = null; store.del(TOKEN);
    show("gate");
    if (msg) { var err = $("[data-dp-login-error]"); err.textContent = msg; err.hidden = false; }
  }
  $("[data-dp-logout]").addEventListener("click", function () { signOut(""); });

  /* ---------- start ---------- */
  function draftKey() { return "mkd-dealer-draft-" + (state.dealer ? state.dealer.id : ""); }
  function saveDraft() {
    store.set(draftKey(), JSON.stringify({ qty: state.qty, truck: state.truck, extra: $("[data-dp-extra]").value, po: $("[data-dp-po]").value, note: $("[data-dp-note]").value }));
  }
  function loadDraft() {
    var d; try { d = JSON.parse(store.get(draftKey()) || "null"); } catch (e) { d = null; }
    state.qty = {};
    if (d && d.qty) Object.keys(d.qty).forEach(function (id) { if (state.byId[id] && d.qty[id] > 0) state.qty[id] = d.qty[id]; });
    $("[data-dp-extra]").value = (d && d.extra) || "";
    $("[data-dp-po]").value = (d && d.po) || "";
    $("[data-dp-note]").value = (d && d.note) || "";
    // the truck: what they picked last time on this device, else the truck on their last order
    var last = state.orders.filter(function (o) { return o.truck; })[0];
    var want = d && d.truck !== undefined ? d.truck : last ? last.truck.id : "";
    state.truck = (state.catalog.trucks || []).some(function (t) { return t.id === want; }) ? want : "";
  }

  function start() {
    show("loading");
    Promise.all([
      api("me"),
      fetch("trade.json", { cache: "no-cache" }).then(function (r) { return r.json(); }),
    ]).then(function (res) {
      var me = res[0];
      if (!me.ok) { signOut(me.error); return; }
      state.dealer = me.dealer; state.orders = me.orders || [];
      state.catalog = res[1];
      state.byId = {};
      state.catalog.items.forEach(function (it) { state.byId[it.id] = it; });
      fillWho();
      loadDraft();
      renderCats(); renderList(); renderCart(false); renderOrders();
      show("app");
      var active = state.orders.filter(function (o) { return o.status !== "delivered" && o.status !== "cancelled"; });
      setTab(location.hash === "#orders" || (active.length && !Object.keys(state.qty).length && location.hash !== "#new") ? "orders" : "new");
    }).catch(function (e) {
      if (e && e.message === "signin") return;
      show("gate");
      var err = $("[data-dp-login-error]"); err.textContent = "We couldn't load your account. Please check your internet and try again."; err.hidden = false;
    });
  }

  function fillWho() {
    var d = state.dealer;
    $("[data-dp-contact]").textContent = d.contact ? ", " + d.contact.split(" ")[0] : "";
    $("[data-dp-firm]").textContent = d.name;
    $("[data-dp-meta]").textContent = [d.city, d.ref ? "Dealer no. " + d.ref : ""].filter(Boolean).join(" · ");
  }

  /* ---------- tabs ---------- */
  function setTab(t) {
    state.tab = t;
    $$("[data-dp-tab]").forEach(function (b) { b.setAttribute("aria-selected", b.getAttribute("data-dp-tab") === t ? "true" : "false"); });
    $$("[data-dp-panel]").forEach(function (p) { p.hidden = p.getAttribute("data-dp-panel") !== t; });
    try { history.replaceState(null, "", "#" + t); } catch (e) {}
    updateBar();
  }
  $$("[data-dp-tab]").forEach(function (b) { b.addEventListener("click", function () { flash(""); setTab(b.getAttribute("data-dp-tab")); }); });

  /* ---------- the product list ---------- */
  var CAT_NAME = function (slug) { var c = state.catalog.categories.filter(function (x) { return x.slug === slug; })[0]; return c ? c.name : slug; };
  function renderCats() {
    var counts = {};
    state.catalog.items.forEach(function (it) { counts[it.category] = (counts[it.category] || 0) + 1; });
    var box = $("[data-dp-cats]");
    box.innerHTML = ['<button type="button" data-cat="all" aria-pressed="true">All</button>'].concat(state.catalog.categories.map(function (c) {
      return '<button type="button" data-cat="' + esc(c.slug) + '" aria-pressed="false">' + esc(c.name) + "<small>" + counts[c.slug] + "</small></button>";
    })).join("");
    $$("button", box).forEach(function (b) {
      b.addEventListener("click", function () {
        state.cat = b.getAttribute("data-cat");
        $$("button", box).forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
        renderList();
      });
    });
  }
  $$("[data-dp-brands] button").forEach(function (b) {
    b.addEventListener("click", function () {
      state.brand = b.getAttribute("data-brand");
      $$("[data-dp-brands] button").forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
      renderList();
    });
  });
  var searchT;
  $("[data-dp-search]").addEventListener("input", function (e) { clearTimeout(searchT); searchT = setTimeout(function () { state.q = e.target.value.trim().toLowerCase(); renderList(); }, 120); });

  function matches(it) {
    if (state.cat !== "all" && it.category !== state.cat) return false;
    if (state.brand !== "all" && it.brand !== state.brand) return false;
    if (!state.q) return true;
    var hay = (it.name + " " + it.brand + " " + (it.format || "") + " " + (it.hindi || "") + " " + CAT_NAME(it.category)).toLowerCase();
    return state.q.split(/\s+/).every(function (w) { var s = syn(w); return hay.indexOf(w) > -1 || (s && hay.indexOf(s) > -1); });
  }
  function itemRow(it) {
    var q = state.qty[it.id] || 0;
    var u = unitOf(it);
    var sub = [it.format || CAT_NAME(it.category), it.carton ? (u === "jhola" ? "Jhola: " : "Carton: ") + it.carton : ""].filter(Boolean).join(" · ");
    return '<li class="dp-item' + (q ? " is-on" : "") + '" data-id="' + esc(it.id) + '">' +
      '<span class="dp-thumb">' + (it.image ? '<img src="' + esc(it.image) + '" alt="" loading="lazy">' : "") + "</span>" +
      '<span class="dp-item-name"><b>' + esc(it.name) + "</b><small>" + esc(it.brand) + " · " + esc(sub) + "</small></span>" +
      '<span class="dp-qty u-' + u + '"><span class="qty qty-sm"><button type="button" data-step="-1" aria-label="One ' + u + ' less">−</button>' +
      '<input type="number" inputmode="numeric" min="0" max="10000" value="' + (q || "") + '" placeholder="0" aria-label="' + (u === "jhola" ? "Jholas" : "Cartons") + " of " + esc(it.name) + '">' +
      '<button type="button" data-step="1" aria-label="One ' + u + ' more">+</button></span><small>' + unitWord(u, 2) + "</small></span></li>";
  }
  function renderList() {
    var list = state.catalog.items.filter(matches);
    $("[data-dp-list]").innerHTML = list.map(itemRow).join("");
    $("[data-dp-none]").hidden = list.length > 0;
    $("[data-dp-count]").textContent = list.length + (list.length === 1 ? " product" : " products") + (state.cat !== "all" ? " in " + CAT_NAME(state.cat).toLowerCase() : "") + (state.q ? " matching “" + state.q + "”" : "");
  }
  function setQty(id, q, from) {
    q = Math.max(0, Math.min(10000, Math.floor(Number(q) || 0)));
    if (q) state.qty[id] = q; else delete state.qty[id];
    var row = $('.dp-item[data-id="' + id + '"]');
    if (row) {
      row.classList.toggle("is-on", q > 0);
      var input = $("input", row);
      if (input !== from) input.value = q || "";
    }
    renderCart(); saveDraft();
  }
  $("[data-dp-list]").addEventListener("click", function (e) {
    var b = e.target.closest("[data-step]"); if (!b) return;
    var id = b.closest(".dp-item").getAttribute("data-id");
    setQty(id, (state.qty[id] || 0) + Number(b.getAttribute("data-step")));
  });
  $("[data-dp-list]").addEventListener("input", function (e) {
    if (e.target.matches("input")) setQty(e.target.closest(".dp-item").getAttribute("data-id"), e.target.value, e.target);
  });

  /* ---------- the order being written ---------- */
  function lines() {
    return Object.keys(state.qty).filter(function (id) { return state.byId[id]; }).map(function (id) { return { id: id, qty: state.qty[id], item: state.byId[id] }; });
  }
  function totals() { return lineTotals(lines()); }
  function renderCart(animate) {
    var ls = lines();
    $("[data-dp-lines]").innerHTML = ls.map(function (l) {
      return '<li data-id="' + esc(l.id) + '"><span class="dp-line-name">' + esc(l.item.name) + "<small>" + esc(l.item.brand) + (l.item.carton ? " · " + esc(l.item.carton) : "") + "</small></span>" +
        '<input type="number" inputmode="numeric" min="0" max="10000" value="' + l.qty + '" aria-label="' + (unitOf(l.item) === "jhola" ? "Jholas" : "Cartons") + " of " + esc(l.item.name) + '"><span class="dp-ctn">' + UNIT[unitOf(l.item)][2] + "</span>" +
        '<button type="button" class="dp-rm" aria-label="Remove ' + esc(l.item.name) + '">×</button></li>';
    }).join("");
    $("[data-dp-cart-empty]").hidden = ls.length > 0;
    $("[data-dp-total]").textContent = amounts(totals()) + (ls.length ? " · " + ls.length + (ls.length === 1 ? " item" : " items") : "");
    renderTruck(animate !== false);
    updateBar();
  }
  function updateBar() {
    var ls = lines();
    var bar = $("[data-dp-mbar]");
    bar.hidden = state.tab !== "new" || !ls.length;
    $("[data-dp-mbar-text]").textContent = ls.length + (ls.length === 1 ? " item · " : " items · ") + amounts(totals());
    var tr = chosenTruck(), mt = $("[data-dp-mbar-truck]");
    if (tr) {
      var f = MKDTruck.load(totals(), tr);
      mt.innerHTML = MKDTruck.icon(tr.tyres) + "<b>" + Math.round(f * 100) + "%</b><i style=\"--f:" + Math.min(1, f) + '"></i>';
      mt.classList.toggle("is-over", f > 1.0001); mt.hidden = false;
    } else mt.hidden = true;
  }
  $("[data-dp-lines]").addEventListener("input", function (e) {
    if (!e.target.matches("input")) return;
    var id = e.target.closest("li").getAttribute("data-id");
    var q = Math.max(0, Math.floor(Number(e.target.value) || 0));
    if (q) state.qty[id] = Math.min(q, 10000);
    var row = $('.dp-item[data-id="' + id + '"] input'); if (row) row.value = q || "";
    var ls = lines();
    $("[data-dp-total]").textContent = amounts(totals()) + " · " + ls.length + (ls.length === 1 ? " item" : " items");
    renderTruck(true); saveDraft(); updateBar();
  });
  $("[data-dp-lines]").addEventListener("change", function (e) { if (e.target.matches("input")) setQty(e.target.closest("li").getAttribute("data-id"), e.target.value); });
  $("[data-dp-lines]").addEventListener("click", function (e) { var b = e.target.closest(".dp-rm"); if (b) setQty(b.closest("li").getAttribute("data-id"), 0); });
  ["[data-dp-extra]", "[data-dp-po]", "[data-dp-note]"].forEach(function (s) { $(s).addEventListener("input", saveDraft); });
  $("[data-dp-review]").addEventListener("click", function () { $("[data-dp-cart]").scrollIntoView({ behavior: "smooth", block: "start" }); });

  /* ---------- the truck ---------- */
  var truckView = window.MKDTruck ? MKDTruck.mount($("[data-tl-stage]")) : null;
  var pctShown = 0, pctRaf = 0;
  function chosenTruck() { return (state.catalog.trucks || []).filter(function (t) { return t.id === state.truck; })[0] || null; }
  function shortName(t) { return t.name.replace(/\s*truck$/i, ""); }
  function countTo(target) {
    var el = $("[data-tl-pct] b"), from = pctShown, t0 = performance.now();
    cancelAnimationFrame(pctRaf);
    (function tick(now) {
      var k = Math.min(1, (now - t0) / 450), v = Math.round(from + (target - from) * (1 - Math.pow(1 - k, 3)));
      el.textContent = v; pctShown = v;
      if (k < 1) pctRaf = requestAnimationFrame(tick);
    })(t0);
  }
  function renderTruck(animate) {
    var card = $("[data-tl]"), trucks = state.catalog.trucks || [];
    if (!truckView || !trucks.length) { card.hidden = true; return; }
    card.hidden = false;
    var t = totals(), chosen = chosenTruck(), has = t.c + t.j > 0;
    var biggest = trucks[trucks.length - 1], suggested = MKDTruck.fit(t, trucks);
    var shown = chosen || suggested || biggest;
    var f = MKDTruck.load(t, shown), pct = Math.round(f * 100);
    truckView.set(shown, t, { ghost: !chosen, animate: animate });
    card.classList.toggle("is-ghost", !chosen);
    card.classList.toggle("is-over", !!chosen && f > 1.0001);
    card.classList.toggle("is-full", !!chosen && f >= 0.98 && f <= 1.0001);
    countTo(pct);
    $("[data-tl-pct]").style.visibility = !chosen && !has ? "hidden" : "";
    var cw = Math.min(1, t.c / (shown.cartons || 1)), jw = Math.min(1 - cw, t.j / (shown.jholas || 1));
    $("[data-tl-meter] .c").style.width = (cw * 100) + "%";
    $("[data-tl-meter] .j").style.width = (Math.max(0, jw) * 100) + "%";
    $("[data-tl-sub]").textContent = chosen ? chosen.name + (chosen.note ? " · " + chosen.note : "") : has ? "Part load. No truck chosen." : "Ordering a full truck? Pick its size.";
    var note = "";
    if (!has) note = chosen ? "Holds " + fmt(chosen.cartons) + " cartons, or " + fmt(chosen.jholas) + " jholas, or a mix of both." : "Add items and watch the truck fill up.";
    else if (!chosen) note = suggested
      ? "This would fill <b>" + pct + "%</b> of a " + esc(shortName(suggested)) + " truck. <button type=\"button\" class=\"tl-act\" data-truck=\"" + esc(suggested.id) + "\">Fill a " + esc(shortName(suggested)) + "</button>"
      : "More than a " + esc(shortName(biggest)) + " truck holds. Pick a truck and our team will plan the loads.";
    else if (f > 1.0001) {
      var bigger = MKDTruck.fit(t, trucks);
      note = "Over by about <b>" + fmt(Math.ceil((f - 1) * chosen.cartons)) + " cartons</b>. " + (bigger
        ? "<button type=\"button\" class=\"tl-act\" data-truck=\"" + esc(bigger.id) + "\">Switch to " + esc(shortName(bigger)) + "</button>"
        : "That's more than one truck: remove some items, or place it and our team will plan two loads.");
    } else if (f >= 0.98) note = "<b>Full truck.</b> Ready to go.";
    else note = "Room for <b>" + fmt(Math.floor((1 - f) * chosen.cartons)) + " more cartons</b> or " + fmt(Math.floor((1 - f) * chosen.jholas)) + " jholas.";
    $("[data-tl-note]").innerHTML = note;
    $("[data-tl-other]").hidden = !$("[data-dp-extra]").value.trim();
    $("[data-tl-pick]").innerHTML = ['<button type="button" role="radio" aria-checked="' + !chosen + '" data-truck=""><span class="tl-none">—</span><b>No truck</b><small>Part load</small></button>']
      .concat(trucks.map(function (tr) {
        var lf = MKDTruck.load(t, tr);
        return '<button type="button" role="radio" aria-checked="' + (tr === chosen) + '" data-truck="' + esc(tr.id) + '"' + (has && lf > 1.0001 ? ' class="is-small"' : "") + ">" + MKDTruck.icon(tr.tyres) +
          "<b>" + esc(shortName(tr)) + "</b><small>" + fmt(tr.cartons) + " ctn</small></button>";
      })).join("");
  }
  $("[data-tl]").addEventListener("click", function (e) {
    var b = e.target.closest("[data-truck]"); if (!b) return;
    state.truck = b.getAttribute("data-truck");
    saveDraft(); renderTruck(true); updateBar();
  });
  $("[data-dp-extra]").addEventListener("input", function () { $("[data-tl-other]").hidden = !$("[data-dp-extra]").value.trim(); });

  var placeBtn = $("[data-dp-place]");
  placeBtn.addEventListener("click", function () {
    var err = $("[data-dp-error]"); err.hidden = true;
    var ls = lines(), extra = $("[data-dp-extra]").value.trim();
    if (!ls.length && !extra) { err.textContent = "Please add at least one item: cartons from the list, or a line under Other items."; err.hidden = false; return; }
    placeBtn.disabled = true; placeBtn.textContent = "Placing your order";
    api("orders", { lines: ls.map(function (l) { return { id: l.id, qty: l.qty }; }), truck: state.truck, extra: extra, poRef: $("[data-dp-po]").value.trim(), note: $("[data-dp-note]").value.trim() })
      .then(function (j) {
        if (!j.ok) { err.textContent = j.error || "That didn't go through. Please try again."; err.hidden = false; if (j.refresh) start(); return; }
        var done = function () {
          state.orders.unshift(j.order);
          state.qty = {};
          $("[data-dp-extra]").value = ""; $("[data-dp-po]").value = ""; $("[data-dp-note]").value = "";
          store.del(draftKey());
          renderList(); renderCart(false); renderOrders();
          setTab("orders");
          flash("<b>Order " + esc(j.order.id) + " is placed.</b> Our team will confirm it and share the expected delivery date here.");
        };
        // a full truck drives off before the order list shows
        if (j.order.truck && truckView && !$("[data-tl]").hidden) {
          $("[data-tl]").scrollIntoView({ behavior: "smooth", block: "nearest" });
          setTimeout(function () { truckView.drive(done); }, 420);
        } else done();
      })
      .catch(function (e) { if (e && e.message !== "signin") { err.textContent = "We couldn't reach the server. Your order is saved on this device; please try again."; err.hidden = false; } })
      .then(function () { placeBtn.disabled = false; placeBtn.textContent = "Place order"; });
  });

  /* ---------- my orders ---------- */
  function isActive(o) { return o.status !== "delivered" && o.status !== "cancelled"; }
  function cartons(o) { return amounts(lineTotals(o.lines)); }
  function truckLine(o) {
    if (!o.truck || !window.MKDTruck) return "";
    var f = o.load != null ? o.load : MKDTruck.load(lineTotals(o.lines), o.truck);
    return '<div class="dp-truckline' + (f > 1.0001 ? " is-over" : "") + '">' + MKDTruck.icon(o.truck.tyres) + "<span>" + esc(o.truck.name) + " · <b>" + Math.round(f * 100) + "% full</b></span><i style=\"--f:" + Math.min(1, f) + '"></i></div>';
  }
  function track(o) {
    if (o.status === "cancelled") return "";
    var at = STAGES.indexOf(o.status);
    return '<ol class="dp-track" aria-label="Order progress">' + STAGES.map(function (s, i) {
      return '<li class="' + (i < at ? "is-done" : i === at ? "is-now" : "") + '"' + (i === at ? ' aria-current="step"' : "") + "><i></i><span>" + LABEL[s] + "</span></li>";
    }).join("") + "</ol>";
  }
  function etaHtml(o) {
    if (o.status === "delivered" || o.status === "cancelled") return "";
    if (!o.eta) return '<div class="dp-eta is-wait"><span>Expected delivery</span><b>We\'ll share the date once your order is confirmed</b></div>';
    var n = daysFromToday(o.eta);
    var rel = n === 0 ? "today" : n === 1 ? "tomorrow" : n > 1 ? "in " + n + " days" : "";
    return '<div class="dp-eta"><span>Expected delivery</span><b>' + esc(day(o.eta)) + "</b>" + (rel ? "<small>" + rel + "</small>" : "") + "</div>";
  }
  function dispatchHtml(o) {
    var d = o.dispatch || {};
    if (!d.lr && !d.transporter && !d.vehicle && !d.invoice) return "";
    var row = function (k, v) { return v ? "<div><dt>" + k + "</dt><dd>" + esc(v) + "</dd></div>" : ""; };
    return '<dl class="dp-dispatch">' + row("Transporter", d.transporter) + row("Bilty / LR no.", d.lr) + row("Vehicle", d.vehicle) + row("Invoice", d.invoice) + row("Dispatched on", d.date ? day(d.date) : "") + "</dl>";
  }
  function itemsHtml(o) {
    var rows = o.lines.map(function (l) {
      var u = unitOf(l);
      return "<tr><td>" + esc(l.name) + (l.ordered !== undefined && l.ordered !== l.qty ? '<small>You ordered ' + l.ordered + ", confirmed " + l.qty + "</small>" : "") + '</td><td class="num">' + l.qty + " " + UNIT[u][2] + "</td></tr>";
    }).join("");
    return '<details class="dp-items"' + (o.lines.length <= 4 ? " open" : "") + "><summary>" + o.lines.length + (o.lines.length === 1 ? " item" : " items") + " · " + cartons(o) + "</summary>" +
      (rows ? '<table><tbody>' + rows + "</tbody></table>" : "") +
      (o.extra ? '<p class="dp-extra"><b>Other items</b>' + esc(o.extra) + "</p>" : "") +
      (o.note ? '<p class="dp-extra"><b>Your note</b>' + esc(o.note) + "</p>" : "") + "</details>";
  }
  function orderCard(o) {
    return '<article class="dp-order s-' + esc(o.status) + '" data-order="' + esc(o.id) + '">' +
      '<header><div><h3>Order ' + esc(o.id) + "</h3><p>Placed " + esc(when(o.createdAt)) + (o.placedBy === "team" ? " by our team" : "") + (o.poRef ? " · Your ref. " + esc(o.poRef) : "") + "</p></div>" +
      '<span class="dp-pill s-' + esc(o.status) + '">' + LABEL[o.status] + "</span></header>" +
      track(o) + etaHtml(o) + truckLine(o) +
      (o.message ? '<p class="dp-msg"><b>From our team</b>' + esc(o.message) + "</p>" : "") +
      dispatchHtml(o) + itemsHtml(o) +
      '<div class="dp-order-actions"><button class="btn btn-ghost" type="button" data-again="' + esc(o.id) + '">Order these again</button>' +
      (o.status === "new" ? '<button class="dp-cancel" type="button" data-cancel="' + esc(o.id) + '">Cancel order</button>' : "") + "</div></article>";
  }
  function pastRow(o) {
    return '<li><span><b>' + esc(o.id) + "</b><small>" + esc(when(o.createdAt)) + " · " + cartons(o) + "</small></span>" +
      '<span class="dp-pill s-' + esc(o.status) + '">' + LABEL[o.status] + "</span>" +
      '<button class="link" type="button" data-again="' + esc(o.id) + '">Order again</button></li>';
  }
  function renderOrders() {
    var active = state.orders.filter(isActive), past = state.orders.filter(function (o) { return !isActive(o); });
    var c = $("[data-dp-active-count]"); c.textContent = active.length; c.hidden = !active.length;
    var html = "";
    if (!state.orders.length) html = '<div class="dp-empty"><h2>No orders yet</h2><p>Your orders will show here, with their stage and the expected delivery date.</p><button class="btn btn-primary" type="button" data-goto-new>Place your first order</button></div>';
    else {
      html += "<h2 class=\"dp-h\">Active orders</h2>" + (active.length ? active.map(orderCard).join("") : '<p class="dp-quiet">Nothing on the way right now.</p>');
      if (past.length) html += '<details class="dp-past"' + (active.length ? "" : " open") + "><summary>Past orders <small>" + past.length + '</small></summary><ul>' + past.map(pastRow).join("") + "</ul></details>";
    }
    $("[data-dp-orders]").innerHTML = html;
  }
  $("[data-dp-orders]").addEventListener("click", function (e) {
    if (e.target.closest("[data-goto-new]")) { setTab("new"); return; }
    var again = e.target.closest("[data-again]");
    if (again) {
      var o = state.orders.filter(function (x) { return x.id === again.getAttribute("data-again"); })[0];
      if (!o) return;
      var missing = 0;
      o.lines.forEach(function (l) { if (state.byId[l.id]) state.qty[l.id] = (state.qty[l.id] || 0) + (l.ordered !== undefined ? l.ordered : l.qty); else missing++; });
      if (o.truck && (state.catalog.trucks || []).some(function (t) { return t.id === o.truck.id; })) state.truck = o.truck.id;
      if (o.extra && $("[data-dp-extra]").value.indexOf(o.extra) < 0) $("[data-dp-extra]").value = ($("[data-dp-extra]").value ? $("[data-dp-extra]").value + "\n" : "") + o.extra;
      saveDraft(); renderList(); renderCart(); setTab("new");
      flash("Added the items from order " + esc(o.id) + ". Change any quantity, then place the order." + (missing ? " " + missing + " item" + (missing === 1 ? " is" : "s are") + " no longer on the list." : ""));
      return;
    }
    var cancel = e.target.closest("[data-cancel]");
    if (cancel) {
      if (!window.confirm("Cancel order " + cancel.getAttribute("data-cancel") + "?")) return;
      cancel.disabled = true;
      api("orders", { action: "cancel", id: cancel.getAttribute("data-cancel") }).then(function (j) {
        if (!j.ok) { window.alert(j.error); cancel.disabled = false; return; }
        state.orders = state.orders.map(function (x) { return x.id === j.order.id ? j.order : x; });
        renderOrders();
      }).catch(function () { cancel.disabled = false; });
    }
  });

  /* ---------- paste a list ---------- */
  var SYN = { dhup: "dhoop", dhoopbatti: "dhoop", lobaan: "loban", lobhan: "loban", guggal: "gugal", gugul: "gugal", kewda: "kevda", kewra: "kevda", kevra: "kevda", mogara: "mogra", rose: "gulab", sandalwood: "sandal", chandan: "chandan", genda: "genda", gainda: "genda", fool: "phool", gm: "gram", grams: "gram", g: "gram", agarbatti: "", incense: "", sticks: "", stick: "", premium: "", pack: "", packet: "", box: "", boxes: "", of: "", the: "", and: "", ctn: "", ctns: "", carton: "", cartons: "", jhola: "", jholas: "", bag: "", bags: "", pcs: "", nos: "", x: "" };
  function syn(w) { return Object.prototype.hasOwnProperty.call(SYN, w) ? SYN[w] : w; }
  function words(s) { return String(s).toLowerCase().replace(/(\d+)\s*(g|gm|gram|grams|ml)\b/g, "$1gram").split(/[^a-z0-9]+/).map(syn).filter(Boolean); }
  var TYPE = { dhoop: 1, cone: 1, jar: 1, bambooless: 1, havan: 1, cup: 1, wet: 1, slim: 1, trim: 1, zipper: 1, pouch: 1, family: 1, eco: 1, tiranga: 1, sacred: 1 };
  var index = null;
  function buildIndex() {
    index = state.catalog.items.map(function (it) {
      var w = words(it.name + " " + it.brand + " " + (it.format || ""));
      return { it: it, set: w.reduce(function (s, x) { s[x] = 1; return s; }, {}), len: w.length };
    });
  }
  function parseLine(line) {
    var raw = line.replace(/^\s*[\d]+[.)]\s+/, "").trim(); // "1. Mogra - 20"
    if (!raw) return null;
    // the number of cartons: one at the end ("- 50", "x 20", "50 ctn") or at the start ("50 ctn mogra")
    var qty = null, m;
    if ((m = raw.match(/(?:[-–:x×=*]|\s)\s*(\d{1,5})\s*(?:ctns?|cartons?|c|jholas?|bags?|pcs|nos|box(?:es)?|peti)?\s*\.?$/i)) && !/\d\s*(g|gm|gram|grams|ml)\s*$/i.test(raw)) { qty = +m[1]; raw = raw.slice(0, m.index); }
    else if ((m = raw.match(/^\s*(\d{1,5})\s*(?:ctns?|cartons?|c|jholas?|bags?|pcs|nos|box(?:es)?|peti)\b\s*/i))) { qty = +m[1]; raw = raw.slice(m[0].length); }
    var q = words(raw);
    if (!q.length) return null;
    if (!index) buildIndex();
    var weight = function (w) { return TYPE[w] ? 1 : /^\d+gram$/.test(w) ? 1 : 3; };
    var total = q.reduce(function (a, w) { return a + weight(w); }, 0);
    var scored = index.map(function (x) {
      var got = q.reduce(function (a, w) { return a + (x.set[w] ? weight(w) : 0); }, 0);
      return { it: x.it, score: got / total - x.len * 0.004 };
    }).filter(function (s) { return s.score > 0.5; }).sort(function (a, b) { return b.score - a.score; });
    return { text: line.trim(), qty: qty, options: scored.slice(0, 6).map(function (s) { return s.it; }) };
  }
  var dlg = $("[data-dp-paste]");
  $("[data-dp-paste-open]").addEventListener("click", function () {
    $("[data-dp-paste-results]").hidden = true; $("[data-dp-paste-foot]").hidden = true;
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
    $("[data-dp-paste-text]").focus();
  });
  var parsed = [];
  $("[data-dp-paste-match]").addEventListener("click", function () {
    parsed = $("[data-dp-paste-text]").value.split(/\r?\n|;/).map(parseLine).filter(Boolean);
    var box = $("[data-dp-paste-results]");
    if (!parsed.length) { box.innerHTML = '<p class="dp-quiet">Paste a few lines first, like “Tiranga Mogra 20 g - 50”.</p>'; box.hidden = false; return; }
    box.innerHTML = '<ul class="dp-match">' + parsed.map(function (p, i) {
      var sel = p.options.length
        ? '<select data-i="' + i + '">' + p.options.map(function (o, j) { return '<option value="' + esc(o.id) + '"' + (j === 0 ? " selected" : "") + ">" + esc(o.name) + "</option>"; }).join("") + '<option value="">None of these: add under Other items</option></select>'
        : '<span class="dp-nomatch">Not on the list: goes under Other items</span>';
      return '<li><span class="dp-said">“' + esc(p.text) + '”</span>' + sel +
        '<label class="dp-mqty"><input type="number" min="0" max="10000" inputmode="numeric" data-q="' + i + '" value="' + (p.qty || "") + '" placeholder="0"> qty</label></li>';
    }).join("") + "</ul>";
    box.hidden = false; $("[data-dp-paste-foot]").hidden = false;
  });
  $("[data-dp-paste-add]").addEventListener("click", function () {
    var other = [], added = 0;
    parsed.forEach(function (p, i) {
      var sel = $('select[data-i="' + i + '"]', dlg), q = Math.floor(Number($('input[data-q="' + i + '"]', dlg).value) || 0);
      var id = sel ? sel.value : "";
      if (id && q > 0) { state.qty[id] = Math.min(10000, (state.qty[id] || 0) + q); added++; }
      else other.push(p.text);
    });
    if (other.length) { var ex = $("[data-dp-extra]"); ex.value = (ex.value ? ex.value + "\n" : "") + other.join("\n"); }
    saveDraft(); renderList(); renderCart();
    dlg.close();
    $("[data-dp-paste-text]").value = "";
    flash(added + (added === 1 ? " item" : " items") + " added to your order" + (other.length ? ", and " + other.length + " line" + (other.length === 1 ? "" : "s") + " put under Other items" : "") + ". Check the quantities before you place it.");
  });

  /* ---------- go ---------- */
  if (state.token) start(); else show("gate");
})();
