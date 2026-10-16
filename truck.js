/* The truck that fills up as a dealer adds cartons and jholas (dealers.html, admin/trade.html).
 *   var t = MKDTruck.mount(el);           draws into el
 *   t.set(truck, { c: 120, j: 30 }, opts)  truck = { id, name, tyres, cartons, jholas }; c = cartons, j = jholas
 *   t.drive(done)                          drives off to the right (after an order is placed)
 *   MKDTruck.load({ c, j }, truck)         -> 0.62 (1 = full)
 *   MKDTruck.fit({ c, j }, trucks)         -> the smallest truck the load fits in, or null
 *   MKDTruck.icon(tyres)                   -> a small truck SVG string, for buttons and cards
 * A truck's load is cartons against what it takes in cartons plus jholas against what it takes in jholas. */
(function () {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";
  var CELL = 16, GAP = 3, STEP = CELL + GAP, ROWS = 6, FR = 5;
  var COLS = { 6: 9, 10: 14, 12: 16, 14: 18, 16: 20, 18: 22, 22: 24 };
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var css = "" +
    ".tk{display:block;width:100%;height:auto;overflow:visible}" +
    ".tk-cell{fill:#efe7da;transform-box:fill-box;transform-origin:50% 100%;transition:fill .25s ease,transform .45s cubic-bezier(.2,1.5,.4,1),opacity .25s ease}" +
    ".tk-cell.c{fill:#c8925a;stroke:#a5713c;stroke-width:1}" +
    ".tk-cell.j{fill:#ec8a2e;stroke:#c86c16;stroke-width:1}" +
    ".tk-cell.in{animation:tk-drop .5s cubic-bezier(.2,1.4,.4,1) backwards}" +
    ".tk-over{fill:#f3c2c2;stroke:#b3202a;stroke-width:1;opacity:0;transform-box:fill-box;transform-origin:50% 100%;transition:opacity .25s ease}" +
    ".tk-over.on{opacity:1;animation:tk-drop .5s cubic-bezier(.2,1.4,.4,1) backwards}" +
    ".tk-frame{fill:none;stroke:#2a1d15;stroke-width:3;transition:stroke .3s ease}" +
    ".tk.is-over .tk-frame{stroke:#b3202a;animation:tk-warn 1.2s ease-in-out infinite}" +
    ".tk.is-ghost .tk-body{opacity:.55}.tk.is-ghost .tk-cab{filter:grayscale(.85)}" +
    ".tk-body{transition:opacity .3s ease}" +
    ".tk-rig.bump{animation:tk-bump .5s ease}" +
    ".tk.driving .tk-all{animation:tk-drive 1.1s cubic-bezier(.5,0,.75,0) forwards}" +
    ".tk.driving .tk-wheel{animation:tk-spin .35s linear infinite}" +
    ".tk.arriving .tk-all{animation:tk-arrive .7s cubic-bezier(.2,.9,.3,1) backwards}" +
    ".tk-wheel{transform-box:fill-box;transform-origin:50% 50%}" +
    "@keyframes tk-drop{from{opacity:0;transform:translateY(-22px) scale(.7)}}" +
    "@keyframes tk-bump{30%{transform:translateY(2.5px)}60%{transform:translateY(-1px)}}" +
    "@keyframes tk-warn{50%{stroke:#e46a6a}}" +
    "@keyframes tk-drive{to{transform:translateX(130%)}}" +
    "@keyframes tk-arrive{from{transform:translateX(-18%);opacity:0}}" +
    "@keyframes tk-spin{to{transform:rotate(360deg)}}" +
    "@media (prefers-reduced-motion:reduce){.tk *{animation:none!important;transition:none!important}}";
  if (!document.getElementById("mkd-truck-css")) {
    var st = document.createElement("style"); st.id = "mkd-truck-css"; st.textContent = css; document.head.appendChild(st);
  }

  function el(name, attrs, parent) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function cols(tyres) { return COLS[tyres] || (tyres < 10 ? 9 : tyres > 18 ? 24 : 18); }
  /* axles seen from the side: front axles under the cab, rear axles under the back of the body */
  function axles(tyres) {
    return { 6: [1, 1], 10: [1, 2], 12: [2, 2], 14: [1, 3], 16: [2, 3], 18: [2, 3], 22: [2, 4] }[tyres] || [1, 2];
  }
  function geometry(tyres) {
    var n = cols(tyres);
    var innerW = n * STEP + GAP, innerH = ROWS * STEP + GAP;
    var x0 = 106, y0 = 30, ow = innerW + 2 * FR, oh = innerH + 2 * FR;
    return { n: n, x0: x0, y0: y0, ow: ow, oh: oh, yB: y0 + oh, width: x0 + ow + 14, height: y0 + oh + 46 };
  }

  function draw(svg, truck) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var g = geometry(truck.tyres), yB = g.yB;
    svg.setAttribute("viewBox", "0 0 " + g.width + " " + g.height);
    var all = el("g", { "class": "tk-all" }, svg);
    el("ellipse", { cx: g.width / 2, cy: yB + 40, rx: g.width / 2 - 6, ry: 5, fill: "#2a1d15", opacity: ".08" }, all);
    var rig = el("g", { "class": "tk-rig" }, all);
    var body = el("g", { "class": "tk-body" }, rig);
    // chassis
    el("rect", { x: 14, y: yB + 1, width: g.x0 + g.ow - 10, height: 9, rx: 3, fill: "#3a2a20" }, body);
    // cab, facing left, in kumkum red with a tricolour band
    var cab = el("g", { "class": "tk-cab" }, body);
    var cy0 = yB - 98;
    el("path", { d: "M30 " + cy0 + "H96Q100 " + cy0 + " 100 " + (cy0 + 4) + "V" + (yB + 4) + "H12Q8 " + (yB + 4) + " 8 " + yB + "V" + (cy0 + 50) + "L18 " + (cy0 + 10) + "Q21 " + cy0 + " 30 " + cy0 + "Z", fill: "#b3202a" }, cab);
    el("path", { d: "M23 " + (cy0 + 12) + "H72V" + (cy0 + 44) + "H15Z", fill: "#cfe1ea" }, cab);
    el("path", { d: "M23 " + (cy0 + 12) + "H44L28 " + (cy0 + 44) + "H15Z", fill: "#fff", opacity: ".35" }, cab);
    el("rect", { x: 79, y: cy0 + 12, width: 15, height: 32, rx: 2, fill: "#cfe1ea" }, cab);
    el("line", { x1: 76, y1: cy0 + 6, x2: 76, y2: yB - 6, stroke: "#8e1820", "stroke-width": 1.5 }, cab);
    el("rect", { x: 66, y: cy0 + 54, width: 7, height: 3, rx: 1.5, fill: "#8e1820" }, cab);
    el("rect", { x: 8, y: cy0 + 66, width: 92, height: 6, fill: "#ff9933" }, cab);
    el("rect", { x: 8, y: cy0 + 72, width: 92, height: 6, fill: "#ffffff" }, cab);
    el("rect", { x: 8, y: cy0 + 78, width: 92, height: 6, fill: "#138808" }, cab);
    el("circle", { cx: 37, cy: cy0 + 75, r: 2.2, fill: "#000080" }, cab);
    el("circle", { cx: 15, cy: yB - 10, r: 4, fill: "#ffd76a" }, cab);
    el("rect", { x: 3, y: yB - 3, width: 34, height: 8, rx: 3, fill: "#2a1d15" }, cab);
    el("rect", { x: 22, y: cy0 - 4, width: 58, height: 5, rx: 2.5, fill: "#8e1820" }, cab);
    // the load body, drawn cut away so the load shows
    el("rect", { x: g.x0, y: g.y0, width: g.ow, height: g.oh, rx: 6, fill: "#fbf7f0" }, body);
    var cells = el("g", { "class": "tk-cells" }, body);
    var list = [];
    for (var c = 0; c < g.n; c++) {
      for (var r = 0; r < ROWS; r++) {
        var x = g.x0 + FR + GAP + c * STEP, y = yB - FR - GAP - CELL - r * STEP;
        list.push(el("rect", { "class": "tk-cell", x: x, y: y, width: CELL, height: CELL, rx: 2.5 }, cells));
      }
    }
    var over = el("g", { "class": "tk-overs" }, body), overList = [];
    for (var o = 0; o < g.n; o++) overList.push(el("rect", { "class": "tk-over", x: g.x0 + FR + GAP + o * STEP, y: g.y0 - CELL - 4, width: CELL, height: CELL, rx: 2.5 }, over));
    el("rect", { "class": "tk-frame", x: g.x0, y: g.y0, width: g.ow, height: g.oh, rx: 6 }, body);
    el("rect", { x: g.x0 + g.ow - 4, y: g.y0 + 8, width: 3, height: g.oh - 16, rx: 1.5, fill: "#2a1d15", opacity: ".5" }, body);
    // wheels
    var ax = axles(truck.tyres), wy = yB + 20, wheels = [];
    var front = ax[0] === 1 ? [56] : [44, 84];
    var rear = [];
    for (var i = 0; i < ax[1]; i++) rear.push(g.x0 + g.ow - 30 - i * 38);
    front.concat(rear).forEach(function (wx) {
      var w = el("g", { "class": "tk-wheel" }, all);
      el("circle", { cx: wx, cy: wy, r: 17, fill: "#2a1d15" }, w);
      el("circle", { cx: wx, cy: wy, r: 8, fill: "#a99f96" }, w);
      el("rect", { x: wx - 1.5, y: wy - 8, width: 3, height: 16, fill: "#6e625a" }, w);
      el("circle", { cx: wx, cy: wy, r: 2.5, fill: "#2a1d15" }, w);
      wheels.push(w);
    });
    el("rect", { x: rear[0] + 22, y: yB + 6, width: 5, height: 22, rx: 1.5, fill: "#b3202a" }, body);
    return { cells: list, overs: overList, rig: rig, n: g.n };
  }

  function load(t, truck) {
    if (!truck) return 0;
    return (t.c || 0) / (truck.cartons || 1) + (t.j || 0) / (truck.jholas || truck.cartons || 1);
  }
  function fit(t, trucks) {
    var ok = (trucks || []).filter(function (tr) { return load(t, tr) <= 1.0001; }).sort(function (a, b) { return a.cartons - b.cartons; });
    return ok[0] || null;
  }

  function mount(host) {
    var svg = el("svg", { "class": "tk", role: "img", "aria-label": "Truck load" });
    host.appendChild(svg);
    var parts = null, key = "", state = [], overState = 0;
    return {
      svg: svg,
      set: function (truck, t, opts) {
        opts = opts || {};
        if (!truck) { svg.style.display = "none"; return; }
        svg.style.display = "";
        var k = truck.tyres + "";
        if (k !== key) {
          parts = draw(svg, truck); key = k; state = []; overState = 0;
          if (!reduce && opts.animate !== false) { svg.classList.remove("arriving"); void svg.getBoundingClientRect(); svg.classList.add("arriving"); }
        }
        svg.classList.toggle("is-ghost", !!opts.ghost);
        var f = load(t, truck), N = parts.cells.length;
        var n = f > 0 ? Math.max(1, Math.round(Math.min(f, 1) * N)) : 0;
        var cShare = f > 0 ? ((t.c || 0) / (truck.cartons || 1)) / f : 1;
        var nc = Math.round(n * cShare);
        var added = 0;
        parts.cells.forEach(function (cell, i) {
          var s = i < nc ? "c" : i < n ? "j" : "";
          if (state[i] === s) return;
          var was = state[i];
          state[i] = s;
          cell.setAttribute("class", "tk-cell" + (s ? " " + s : ""));
          if (s && !was && !reduce && opts.animate !== false) {
            cell.style.animationDelay = Math.min(added++ * 14, 700) + "ms";
            cell.classList.add("in");
          }
        });
        var m = f > 1 ? Math.min(parts.overs.length, Math.max(1, Math.round((f - 1) * N))) : 0;
        parts.overs.forEach(function (o, i) {
          var on = i < m;
          if (on && i >= overState && !reduce) o.style.animationDelay = Math.min((i - overState) * 18, 500) + "ms";
          o.setAttribute("class", "tk-over" + (on ? " on" : ""));
        });
        overState = m;
        svg.classList.toggle("is-over", f > 1.0001);
        if (added && !reduce && opts.animate !== false) {
          parts.rig.classList.remove("bump"); void parts.rig.getBoundingClientRect(); parts.rig.classList.add("bump");
        }
        svg.setAttribute("aria-label", truck.name + ", " + Math.round(f * 100) + "% full");
      },
      drive: function (done) {
        if (reduce || svg.style.display === "none") { if (done) done(); return; }
        svg.classList.add("driving");
        setTimeout(function () { svg.classList.remove("driving"); key = ""; if (done) done(); }, 1150);
      },
    };
  }

  function icon(tyres) {
    var n = cols(tyres), w = Math.round(14 + n * 1.6), ax = axles(tyres), wheels = "";
    var front = ax[0] === 1 ? [6] : [5, 9];
    for (var i = 0; i < ax[1]; i++) front.push(w + 10 - 3 - i * 4.2);
    front.forEach(function (x) { wheels += '<circle cx="' + x + '" cy="15" r="2.2"/>'; });
    return '<svg class="tk-icon" viewBox="0 0 ' + (w + 13) + ' 18" width="' + (w + 13) + '" height="18" aria-hidden="true" fill="currentColor">' +
      '<path d="M2 13V8l2.5-4H10v9z" opacity=".9"/><rect x="11" y="2" width="' + w + '" height="11" rx="1.5"/>' + wheels + "</svg>";
  }

  window.MKDTruck = { mount: mount, load: load, fit: fit, icon: icon };
})();
