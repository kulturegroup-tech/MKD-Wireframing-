/* Shop page: renders products.json (written by scripts/build-products.mjs from the products added in the admin).
 * Cards link to each product's page; "Add to cart" buttons are handled by cart.js.
 * Address options: products.html#kits (category), ?brand=Tiranga, ?q=chandan (search). */
(function () {
  "use strict";
  var root = document.querySelector("[data-catalog]");
  if (!root) return;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var inr = function (n) { return "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 }); };

  var grid = $("[data-grid]"), tabs = $("[data-cat-tabs]"), countLine = $("[data-count-line]"),
      empty = $("[data-empty]"), source = $("[data-source]"), search = $("[data-search]");
  var data = { categories: [], products: [] };
  var params = new URLSearchParams(location.search);
  var state = { cat: "all", brand: params.get("brand") || "all", q: params.get("q") || "" };
  if (state.q) search.value = state.q;

  function catName(slug) {
    var c = data.categories.filter(function (x) { return x.slug === slug; })[0];
    return c ? c.name : slug;
  }
  function priceHtml(p) {
    if (!p.price) return "";
    return (p.price.from ? "From " : "") + inr(p.price.amount) + (p.price.regular ? " <s>" + inr(p.price.regular) + "</s>" : "");
  }
  // same markup as cardHtml() in scripts/build-products.mjs
  function card(p) {
    var tag = p.badge ? '<span class="pcard-tag">' + esc(p.badge) + "</span>" : "";
    var visual = p.image
      ? '<span class="pcard-visual' + (p.pack ? " is-pack" : "") + '"><img src="' + esc(p.image) + '" alt="' + esc(p.name) + '" loading="lazy">' + tag +
        (p.sellable && !p.inStock ? '<span class="pcard-sold">Sold out</span>' : "") + "</span>"
      : '<span class="pcard-visual ' + (p.brand === "Tiranga" ? "brand-tiranga-bg" : "brand-sacred-bg") + '"><span class="dev" lang="hi">' + esc(p.hindi || p.name) + "</span>" + tag + "</span>";
    var action = !p.sellable ? '<a class="pcard-add is-quiet" href="' + esc(p.url) + '">See details</a>'
      : !p.inStock ? '<span class="pcard-add is-off">Sold out</span>'
      : p.variants.length > 1 ? '<a class="pcard-add" href="' + esc(p.url) + '">Choose a pack</a>'
      : '<button class="pcard-add" type="button" data-add-id="' + esc(p.id) + '">Add to cart</button>';
    return '<article class="pcard"><a class="pcard-link" href="' + esc(p.url) + '">' + visual +
      '<span class="pcard-meta"><span class="pcard-brand">' + esc(p.brand) + "</span>" +
      '<span class="pcard-name">' + esc(p.name) + "</span>" +
      '<span class="pcard-format">' + esc(p.format || catName(p.category)) + "</span>" +
      (p.price ? '<span class="pcard-price">' + priceHtml(p) + "</span>" : "") +
      "</span></a>" + action + "</article>";
  }

  function filtered() {
    var q = state.q.toLowerCase();
    return data.products.filter(function (p) {
      if (state.cat !== "all" && p.category !== state.cat) return false;
      if (state.brand !== "all" && p.brand !== state.brand) return false;
      if (q && (p.name + " " + (p.hindi || "") + " " + (p.format || "") + " " + (p.description || "")).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }

  function renderTabs() {
    var counts = {};
    data.products.forEach(function (p) { counts[p.category] = (counts[p.category] || 0) + 1; });
    tabs.innerHTML = ['<button type="button" role="tab" data-cat="all">All<small>' + data.products.length + "</small></button>"]
      .concat(data.categories.filter(function (c) { return counts[c.slug]; }).map(function (c) {
        return '<button type="button" role="tab" data-cat="' + esc(c.slug) + '">' + esc(c.name) + "<small>" + counts[c.slug] + "</small></button>";
      })).join("");
    $$("button", tabs).forEach(function (b) {
      b.addEventListener("click", function () { setCat(b.getAttribute("data-cat"), true); });
    });
  }

  function render() {
    $$("button", tabs).forEach(function (b) { b.setAttribute("aria-selected", b.getAttribute("data-cat") === state.cat ? "true" : "false"); });
    $$("[data-brand]", root).forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-brand") === state.brand ? "true" : "false"); });
    var list = filtered();
    grid.innerHTML = list.map(card).join("");
    empty.hidden = list.length > 0;
    var label = state.cat === "all" ? "products" : catName(state.cat).toLowerCase();
    countLine.textContent = list.length + " " + (list.length === 1 && state.cat === "all" ? "product" : label) +
      (state.brand !== "all" ? " from " + state.brand : "") + (state.q ? " matching “" + state.q + "”" : "");
  }

  function setCat(slug, push) {
    state.cat = slug;
    if (push) {
      var h = slug === "all" ? location.pathname + location.search : "#" + slug;
      try { history.replaceState(null, "", h); } catch (e) { /* ignore in sandboxed frames */ }
    }
    render();
  }

  $$("[data-brand]", root).forEach(function (b) {
    b.addEventListener("click", function () { state.brand = b.getAttribute("data-brand"); render(); });
  });
  var t;
  search.addEventListener("input", function () { clearTimeout(t); t = setTimeout(function () { state.q = search.value.trim(); render(); }, 120); });
  $("[data-reset]").addEventListener("click", function () { state = { cat: "all", brand: "all", q: "" }; search.value = ""; setCat("all", true); });

  // products.html#<category> picks a tab; an old products.html#<product> link opens that product's page
  function fromHash() {
    var h = decodeURIComponent(location.hash.slice(1));
    if (data.categories.some(function (c) { return c.slug === h; })) { state.cat = h; return true; }
    var p = data.products.filter(function (x) { return x.id === h; })[0];
    if (p) { location.replace(p.url); return false; }
    return true;
  }
  window.addEventListener("hashchange", function () { if (fromHash()) render(); });

  fetch("products.json", { cache: "no-cache" })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (json) {
      data = json;
      if (!fromHash()) return;
      renderTabs(); render();
      source.innerHTML = 'Buying for a shop or a region? <a class="link" href="index.html#partner">Talk to our trade desk</a>.';
    })
    .catch(function () {
      countLine.textContent = "We couldn't load the shop right now. Please refresh the page.";
    });
})();
