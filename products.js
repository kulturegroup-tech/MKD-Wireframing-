/* Products catalogue: renders products.json, which scripts/build-products.mjs writes from the products added in the admin. */
(function () {
  "use strict";
  var root = document.querySelector("[data-catalog]");
  if (!root) return;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

  var grid = $("[data-grid]"), tabs = $("[data-cat-tabs]"), countLine = $("[data-count-line]"),
      empty = $("[data-empty]"), source = $("[data-source]"), search = $("[data-search]"), dialog = $("[data-quick]");
  var data = { categories: [], products: [] };
  var state = { cat: "all", brand: "all", q: "" };

  function catName(slug) {
    var c = data.categories.filter(function (x) { return x.slug === slug; })[0];
    return c ? c.name : slug;
  }
  function brandClass(p) { return p.brand === "Tiranga" ? "brand-tiranga-bg" : "brand-sacred-bg"; }
  function priceHtml(p) {
    if (!p.price || p.price.amount == null) return "";
    var s = (p.price.from ? "From " : "") + inr.format(p.price.amount);
    if (p.price.regular && p.price.regular > p.price.amount) s += " <s>" + inr.format(p.price.regular) + "</s>";
    return s;
  }
  function visual(p, cls, tag, extra) {
    tag = tag || "div"; extra = extra || "";
    if (p.image) {
      var pack = p.pack ? " is-pack" : "";
      return "<" + tag + ' class="' + cls + pack + '"><img src="' + esc(p.image) + '" alt="' + esc(p.name) + '" loading="lazy">' + extra + "</" + tag + ">";
    }
    return "<" + tag + ' class="' + cls + " " + brandClass(p) + '"><span class="dev" lang="hi">' + esc(p.hindi || p.name) + "</span>" + extra + "</" + tag + ">";
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
      .concat(data.categories.map(function (c) {
        return '<button type="button" role="tab" data-cat="' + esc(c.slug) + '">' + esc(c.name) + "<small>" + (counts[c.slug] || 0) + "</small></button>";
      })).join("");
    $$("button", tabs).forEach(function (b) {
      b.addEventListener("click", function () { setCat(b.getAttribute("data-cat"), true); });
    });
  }

  function render() {
    $$("button", tabs).forEach(function (b) { b.setAttribute("aria-selected", b.getAttribute("data-cat") === state.cat ? "true" : "false"); });
    $$("[data-brand]", root).forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-brand") === state.brand ? "true" : "false"); });
    var list = filtered();
    grid.innerHTML = list.map(function (p, i) {
      return '<button type="button" class="pcard" data-i="' + data.products.indexOf(p) + '" aria-haspopup="dialog">' +
        visual(p, "pcard-visual", "span", p.category === "kits" ? '<span class="pcard-tag">Diwali</span>' : "") +
        '<span class="pcard-meta"><span class="pcard-brand">' + esc(p.brand) + "</span>" +
        '<span class="pcard-name">' + esc(p.name) + "</span>" +
        '<span class="pcard-format">' + esc(p.format || catName(p.category)) + "</span>" +
        (priceHtml(p) ? '<span class="pcard-price">' + priceHtml(p) + "</span>" : "") +
        "</span></button>";
    }).join("");
    empty.hidden = list.length > 0;
    var label = state.cat === "all" ? "products" : catName(state.cat).toLowerCase();
    countLine.textContent = list.length + " " + (list.length === 1 && state.cat === "all" ? "product" : label) +
      (state.brand !== "all" ? " from " + state.brand : "") + (state.q ? " matching “" + state.q + "”" : "");
    $$(".pcard", grid).forEach(function (card) {
      card.addEventListener("click", function () { openQuick(data.products[+card.getAttribute("data-i")]); });
    });
  }

  function setCat(slug, push) {
    state.cat = slug;
    if (push) {
      var h = slug === "all" ? location.pathname : "#" + slug;
      try { history.replaceState(null, "", h); } catch (e) { /* ignore in sandboxed frames */ }
    }
    render();
  }

  function openQuick(p) {
    if (!dialog || typeof dialog.showModal !== "function") { if (p.url) window.open(p.url, "_blank", "noopener"); return; }
    $("[data-quick-media]").outerHTML = visual(p, "quick-media").replace('class="quick-media', 'data-quick-media class="quick-media');
    // more than one photo: thumbnails under the main image
    var thumbs = $("[data-quick-thumbs]");
    if (thumbs) {
      var imgs = p.images || [];
      thumbs.hidden = imgs.length < 2;
      thumbs.innerHTML = imgs.length < 2 ? "" : imgs.map(function (src, k) {
        return '<button type="button" aria-label="Photo ' + (k + 1) + '" aria-pressed="' + (k === 0) + '"><img src="' + esc(src) + '" alt=""></button>';
      }).join("");
      $$("button", thumbs).forEach(function (b, k) {
        b.addEventListener("click", function () {
          var main = $("[data-quick-media] img"); if (main) main.src = imgs[k];
          $$("button", thumbs).forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
        });
      });
    }
    $("[data-quick-brand]").textContent = p.brand + ", " + catName(p.category);
    $("[data-quick-name]").textContent = p.name;
    $("[data-quick-format]").textContent = p.format || "";
    $("[data-quick-desc]").textContent = p.description || "";
    $("[data-quick-price]").innerHTML = priceHtml(p);
    var buy = $("[data-quick-buy]");
    buy.hidden = !p.url;
    buy.href = p.url || "#";
    buy.textContent = p.buyLabel || (/tirangaagarbatti\.com/.test(p.url || "") ? "Buy on tirangaagarbatti.com" : "Buy now");
    dialog.showModal();
  }
  if (dialog) {
    $("[data-quick-close]").addEventListener("click", function () { dialog.close(); });
    dialog.addEventListener("click", function (e) { if (e.target === dialog) dialog.close(); });
  }

  $$("[data-brand]", root).forEach(function (b) {
    b.addEventListener("click", function () { state.brand = b.getAttribute("data-brand"); render(); });
  });
  var t;
  search.addEventListener("input", function () { clearTimeout(t); t = setTimeout(function () { state.q = search.value.trim(); render(); }, 120); });
  $("[data-reset]").addEventListener("click", function () { state = { cat: "all", brand: "all", q: "" }; search.value = ""; setCat("all", true); });
  window.addEventListener("hashchange", function () {
    var h = location.hash.slice(1);
    if (data.categories.some(function (c) { return c.slug === h; })) setCat(h, false);
  });

  fetch("products.json", { cache: "no-cache" })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (json) {
      data = json;
      var h = location.hash.slice(1);
      if (data.categories.some(function (c) { return c.slug === h; })) state.cat = h;
      renderTabs(); render();
      source.innerHTML = 'Buying for a shop or a region? <a class="link" href="index.html#partner">Talk to our trade desk</a>.';
    })
    .catch(function () {
      countLine.textContent = "We couldn't load the catalogue right now.";
      grid.innerHTML = '<p>Browse all products on <a class="link" href="https://tirangaagarbatti.com/" target="_blank" rel="noopener">tirangaagarbatti.com</a>.</p>';
    });
})();
