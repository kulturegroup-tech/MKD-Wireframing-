(function () {
  "use strict";
  var doc = document.documentElement;
  doc.classList.add("js");
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var fmt = new Intl.NumberFormat("en-IN");

  /* ---------- Diwali countdown (Lakshmi Puja muhurat, 8 Nov 2026, 5:32 pm IST) ---------- */
  var DIWALI = Date.parse(doc.getAttribute("data-diwali") || "2026-11-08T17:32:00+05:30");   // set from the admin (Diwali kit)
  function tickCountdown() {
    var ms = Math.max(0, DIWALI - Date.now());
    var d = Math.floor(ms / 86400000);
    var h = Math.floor(ms / 3600000) % 24;
    var m = Math.floor(ms / 60000) % 60;
    $$("[data-days]").forEach(function (el) { el.textContent = d; });
    var cd = $("[data-countdown]");
    if (cd) {
      $("[data-cd=d]", cd).textContent = d;
      $("[data-cd=h]", cd).textContent = String(h).padStart(2, "0");
      $("[data-cd=m]", cd).textContent = String(m).padStart(2, "0");
    }
  }
  // The day after Lakshmi Puja (India time) the Diwali offer retires by itself:
  // [data-diwali-only] goes, [data-after-diwali] appears, links and labels switch to their after-Diwali versions.
  var istDay = function (t) { return new Date(t + 5.5 * 3600 * 1000).toISOString().slice(0, 10); };
  if (istDay(Date.now()) > istDay(DIWALI)) {
    doc.classList.add("is-after-diwali");
    $$("[data-diwali-only]").forEach(function (el) { el.remove(); });
    $$("[data-after-diwali]").forEach(function (el) { el.hidden = false; });
    $$("[data-after-diwali-href]").forEach(function (a) { if (/#diwali$/.test(a.getAttribute("href") || "")) a.setAttribute("href", a.getAttribute("data-after-diwali-href")); });
    $$("[data-after-diwali-text]").forEach(function (el) { el.textContent = el.getAttribute("data-after-diwali-text"); });
  }
  tickCountdown();
  setInterval(tickCountdown, 30000);

  /* ---------- live stick ticker: 13M a day, prorated from midnight IST ---------- */
  var tickerEl = $("[data-ticker]");
  function sticksToday() {
    var secIST = ((Date.now() / 1000) + 19800) % 86400;
    return Math.floor(13000000 * secIST / 86400);
  }
  if (tickerEl) {
    tickerEl.textContent = fmt.format(sticksToday());
    setInterval(function () { tickerEl.textContent = fmt.format(sticksToday()); }, reduceMotion ? 5000 : 120);
  }

  /* ---------- nav state + floating Diwali pill ---------- */
  var nav = $(".nav");
  var pill = $("[data-kit-pill]");
  var diwali = $("#diwali");
  var diwaliInView = false;
  if (diwali && "IntersectionObserver" in window) {
    new IntersectionObserver(function (e) { diwaliInView = e[0].isIntersecting; onScroll(); }, { threshold: 0.15 }).observe(diwali);
  }
  function onScroll() {
    var y = window.scrollY;
    if (nav) nav.classList.toggle("is-scrolled", y > 8);
    if (pill) pill.classList.toggle("is-shown", y > window.innerHeight * 0.9 && !diwaliInView);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  $$(".nav-menu nav a").forEach(function (a) {
    a.addEventListener("click", function () { var d = a.closest("details"); if (d) d.open = false; });
  });

  /* ---------- hero: banner and photo slideshow, a new slide every 4 seconds ---------- */
  var slideBox = $("[data-hero-slides]");
  if (slideBox) {
    // dated slides: data-until = hide after this day; data-lead-until = after this day, move behind the other slides
    (function () {
      var today = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10); // date in India
      var all = $$("img", slideBox), dotsAll = $$("[data-hero-dots] button");
      var node = function (img) { return img.parentNode.tagName === "PICTURE" ? img.parentNode : img; };
      var keep = [], later = [];
      all.forEach(function (img, k) {
        var until = img.getAttribute("data-until"), lead = img.getAttribute("data-lead-until");
        if (until && today > until) { node(img).remove(); if (dotsAll[k]) dotsAll[k].remove(); return; }
        (lead && today > lead ? later : keep).push([img, dotsAll[k]]);
      });
      keep.concat(later).forEach(function (pair, k) {
        slideBox.appendChild(node(pair[0]));
        pair[0].classList.toggle("is-active", k === 0);
        if (pair[0].getAttribute("loading") === "lazy" && k === 0) pair[0].removeAttribute("loading");
        if (pair[1]) { pair[1].parentNode.appendChild(pair[1]); pair[1].setAttribute("aria-label", "Show slide " + (k + 1)); }
      });
      var dotBoxEl = $("[data-hero-dots]");
      if (dotBoxEl && keep.length + later.length < 2) dotBoxEl.hidden = true;
    })();
    var slides = $$("img", slideBox), dots = $$("[data-hero-dots] button"), dotBox = $("[data-hero-dots]");
    var cur = 0, timer = null, SLIDE_MS = 4000, heroVisible = true, swapT = null;
    var caption = $("[data-hero-text] span");
    var heroMedia = $("[data-hero-media]"), heroLink = $("[data-hero-link]");
    doc.style.setProperty("--slide-ms", SLIDE_MS + "ms");
    var show = function (i) {
      cur = (i + slides.length) % slides.length;
      slides.forEach(function (s, k) { s.classList.toggle("is-active", k === cur); });
      // designed banners show whole, with no caption or shading; a slide with a link is clickable
      if (heroMedia) heroMedia.classList.toggle("is-banner", slides[cur].classList.contains("is-banner"));
      if (heroLink) {
        var href = slides[cur].getAttribute("data-link");
        heroLink.hidden = !href;
        if (href) { heroLink.href = href; heroLink.setAttribute("aria-label", slides[cur].getAttribute("alt") || "Open"); }
      }
      // each slide carries its own line; fade it out, swap, fade back in
      var line = slides[cur].getAttribute("data-caption");
      if (caption && caption.textContent !== line) {
        clearTimeout(swapT); caption.classList.add("is-swapping");
        swapT = setTimeout(function () { caption.textContent = line; caption.classList.remove("is-swapping"); }, 380);
      }
      dots.forEach(function (d, k) {
        d.setAttribute("aria-pressed", "false");
        if (k === cur) { void d.offsetWidth; d.setAttribute("aria-pressed", "true"); }
      });
    };
    var stop = function () { clearInterval(timer); timer = null; if (dotBox) dotBox.classList.add("is-paused"); };
    var start = function () {
      if (reduceMotion || timer || !heroVisible || document.hidden || slides.length < 2) return;
      if (dotBox) dotBox.classList.remove("is-paused");
      show(cur);
      timer = setInterval(function () { show(cur + 1); }, SLIDE_MS);
    };
    dots.forEach(function (d, k) { d.addEventListener("click", function () { stop(); show(k); start(); }); });
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (e) { heroVisible = e[0].isIntersecting; heroVisible ? start() : stop(); }).observe(slideBox);
    }
    document.addEventListener("visibilitychange", function () { document.hidden ? stop() : start(); });
    if (reduceMotion && dotBox) dotBox.classList.add("is-paused");
    show(0);
    start();
  }

  /* ---------- count-up numbers ---------- */
  function countUp(el) {
    var target = parseFloat(el.getAttribute("data-count"));
    var suffix = el.getAttribute("data-suffix") || "";
    if (reduceMotion) { el.textContent = fmt.format(target) + suffix; return; }
    var start = performance.now(), dur = 1600;
    function step(now) {
      var t = Math.min(1, (now - start) / dur);
      var eased = 1 - Math.pow(1 - t, 3);
      el.textContent = fmt.format(Math.round(target * eased)) + suffix;
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  if ("IntersectionObserver" in window) {
    var countObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { countUp(e.target); countObs.unobserve(e.target); }
      });
    }, { threshold: 0.6 });
    $$("[data-count]").forEach(function (el) { countObs.observe(el); });
  }

  /* ---------- making: active step drives the sticky picture ---------- */
  var steps = $$("[data-step]");
  var stepImgs = $$("[data-step-img]");
  var stepBar = $("[data-step-progress]");
  function setStep(i) {
    steps.forEach(function (s, k) { s.classList.toggle("is-active", k === i); });
    stepImgs.forEach(function (img, k) { img.classList.toggle("is-active", k === i); });
    if (stepBar) stepBar.style.width = ((i + 1) / steps.length * 100) + "%";
  }
  if (steps.length && "IntersectionObserver" in window) {
    var stepObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) setStep(parseInt(e.target.getAttribute("data-step"), 10));
      });
    }, { rootMargin: "-45% 0px -45% 0px" });
    steps.forEach(function (s) { stepObs.observe(s); });
  }

  /* ---------- fragrance library ---------- */
  var NOTES = [
    ["Chandan", "चंदन", "Sandalwood and woods", [1,1,1], "Warm grain, milky wood and a long, quiet dry-down. The note that anchors the house."],
    ["Mogra", "मोगरा", "Jasmine", [1,1,0], "The fullness of jasmine after dusk, kept bright rather than sugary."],
    ["Gulab", "गुलाब", "Rose", [1,1,1], "A deeper Indian rose: petal, preserve and a soft sweetness that stays close."],
    ["Greenwood", "ग्रीनवुड", "Vetiver and cedar", [1,1,0], "Dry vetiver root, cedar and green herbs. A bridge between the mandir and the living room."],
    ["Rajnigandha", "रजनीगंधा", "Tuberose", [0,1,0], "Creamy white petals with a green edge. A night flower that doesn't need volume."],
    ["Agarwood", "अगरवुड", "Oud and resinous wood", [0,0,1], "Dark wood, resin and leathered warmth, kept for Sacred Selections."],
    ["Ziyarat", "ज़ियारत", "Attar and oud", [1,1,1], "Oud, rose and amber in the tradition of attar and bakhoor."],
    ["Kesar Chandan", "केसर चंदन", "Saffron and sandalwood", [0,1,1], "Saffron laid across sandalwood: warm, dry and quietly rich."],
    ["Loban", "लोबान", "Benzoin resin", [0,1,1], "Balsamic resin with a vanilla smoke. The familiar act of clearing a room."],
    ["Sai Shraddha", "साईं श्रद्धा", "Devotional floral", [1,0,0], "A soft floral that sits gently through the long rhythm of daily worship."],
    ["Vrindavan Flora", "वृंदावन फ्लोरा", "Green floral", [1,1,0], "Marigold and tulsi over a fresh green top, drawn from flowers of offering."],
    ["Panadi Darbar", "पनाडी दरबार", "Herbal blend", [1,0,0], "A herb-forward daily blend, steady from the first stick to the last."]
  ];
  var BRANDS = ["Tiranga", "Sacred", "Sacred Selections"];
  var list = $("[data-note-list]");
  if (list) {
    var devBox = $("[data-note-dev]");
    var renderNote = function (i) {
      var n = NOTES[i];
      $$("button", list).forEach(function (b, k) { b.setAttribute("aria-selected", k === i ? "true" : "false"); b.tabIndex = k === i ? 0 : -1; });
      $("[data-note-name]").textContent = n[0];
      $("[data-note-family]").textContent = n[2];
      $("[data-note-desc]").textContent = n[4];
      $("[data-note-grades]").innerHTML = BRANDS.map(function (b, k) { return '<span class="' + (n[3][k] ? "on" : "") + '">' + b + "</span>"; }).join("");
      var shop = $("[data-note-shop]");
      if (n[3][0] || n[3][1]) {
        shop.hidden = false;
        shop.href = "products.html?q=" + encodeURIComponent(n[0]);
        shop.textContent = "Shop " + n[0];
      } else {
        shop.hidden = false;
        shop.href = "selections.html";
        shop.textContent = "Find it in Sacred Selections";
      }
      devBox.classList.add("is-swapping");
      setTimeout(function () { $("b", devBox).textContent = n[1]; devBox.classList.remove("is-swapping"); }, reduceMotion ? 0 : 220);
    };
    NOTES.forEach(function (n, i) {
      var b = document.createElement("button");
      b.type = "button"; b.setAttribute("role", "tab"); b.setAttribute("aria-controls", "note-panel");
      b.textContent = n[0];
      b.addEventListener("click", function () { renderNote(i); });
      list.appendChild(b);
    });
    list.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      var btns = $$("button", list), cur = btns.indexOf(document.activeElement);
      if (cur < 0) return;
      var next = (cur + (e.key === "ArrowRight" ? 1 : -1) + btns.length) % btns.length;
      btns[next].focus(); renderNote(next);
    });
    renderNote(0);
  }

  /* ---------- partner enquiry ---------- */
  var brief = $("[data-brief]");
  if (brief) {
    var state = { interest: "Distribution", format: "Agarbatti", volume: "Trial order", market: "" };
    var text = function () {
      return [
        "Hello, I'd like to discuss a trade enquiry.",
        "Need: " + state.interest,
        "Market: " + (state.market || "to be discussed"),
        "Format: " + state.format,
        "Starting volume: " + state.volume
      ].join("\n");
    };
    var update = function () {
      var t = text();
      $("[data-brief-preview]", brief).textContent = t;
      $("[data-brief-wa]", brief).href = "https://wa.me/916389004433?text=" + encodeURIComponent(t);
      $("[data-brief-mail]", brief).href = "mailto:contact@mkdtiranga.com?subject=" + encodeURIComponent("Trade enquiry: " + state.interest + (state.market ? ", " + state.market : "")) + "&body=" + encodeURIComponent(t);
    };
    $$("[data-group]", brief).forEach(function (g) {
      var key = g.getAttribute("data-group");
      $$("button", g).forEach(function (b) {
        b.addEventListener("click", function () {
          $$("button", g).forEach(function (x) { x.setAttribute("aria-pressed", "false"); });
          b.setAttribute("aria-pressed", "true");
          state[key] = b.textContent; update();
        });
      });
    });
    $("#brief-market").addEventListener("input", function (e) { state.market = e.target.value.trim(); update(); });
    brief.addEventListener("submit", function (e) { e.preventDefault(); });
    $("[data-brief-copy]", brief).addEventListener("click", function () {
      var done = function () { var c = $("[data-brief-copied]", brief); c.hidden = false; setTimeout(function () { c.hidden = true; }, 2000); };
      if (navigator.clipboard) navigator.clipboard.writeText(text()).then(done, function () {});
    });
    update();
  }

  /* ---------- embers over the Diwali section ---------- */
  var canvas = $("[data-embers]");
  if (canvas && !reduceMotion && canvas.getContext) {
    var ctx = canvas.getContext("2d"), parts = [], running = false, w = 0, h = 0;
    var size = function () {
      var r = canvas.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
      w = r.width; h = r.height; canvas.width = w * dpr; canvas.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    var spawn = function (fresh) {
      return { x: Math.random() * w, y: fresh ? Math.random() * h : h + 10, r: 0.8 + Math.random() * 2.2, vy: 0.25 + Math.random() * 0.6, vx: (Math.random() - 0.5) * 0.25, a: 0.2 + Math.random() * 0.6, p: Math.random() * Math.PI * 2 };
    };
    var frame = function () {
      if (!running) return;
      ctx.clearRect(0, 0, w, h);
      parts.forEach(function (p, i) {
        p.y -= p.vy; p.p += 0.02; p.x += p.vx + Math.sin(p.p) * 0.2;
        var fade = Math.min(1, p.y / (h * 0.5));
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(240," + (140 + Math.round(p.r * 20)) + ",40," + (p.a * fade) + ")";
        ctx.fill();
        if (p.y < -10) parts[i] = spawn(false);
      });
      requestAnimationFrame(frame);
    };
    size(); for (var i = 0; i < 70; i++) parts.push(spawn(true));
    window.addEventListener("resize", size);
    new IntersectionObserver(function (e) {
      var vis = e[0].isIntersecting;
      if (vis && !running) { running = true; requestAnimationFrame(frame); }
      if (!vis) running = false;
    }).observe(canvas);
  }

  /* ---------- Sacred Selections: expandable fragrance rows ---------- */
  $$(".sel-row").forEach(function (row) {
    var btn = $("button", row);
    btn.addEventListener("click", function () {
      var open = row.getAttribute("data-open") !== "true";
      row.setAttribute("data-open", open ? "true" : "false");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });
  });

  /* ---------- stories: YouTube loads only when someone presses play ---------- */
  $$("[data-yt]").forEach(function (box) {
    var btn = $("button", box);
    if (!btn) return;
    btn.addEventListener("click", function () {
      var f = document.createElement("iframe");
      f.src = "https://www.youtube-nocookie.com/embed/" + box.getAttribute("data-yt") + "?autoplay=1&rel=0";
      f.title = btn.getAttribute("aria-label") || "Video";
      f.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
      f.allowFullscreen = true;
      box.innerHTML = ""; box.appendChild(f);
    });
  });

  /* ---------- stories list: filter by kind ---------- */
  var filterBox = $("[data-story-filters]"), storyGrid = $("[data-story-grid]");
  if (filterBox && storyGrid) {
    $$("button", filterBox).forEach(function (b) {
      b.addEventListener("click", function () {
        var f = b.getAttribute("data-filter");
        $$("button", filterBox).forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
        $$(".story-card", storyGrid).forEach(function (c) { c.hidden = f !== "all" && c.getAttribute("data-cat") !== f; });
      });
    });
  }

  /* ---------- scroll-driven scenes (GSAP) ---------- */
  if (!window.gsap || !window.ScrollTrigger || reduceMotion) return;
  gsap.registerPlugin(ScrollTrigger);

  // Opening animations wait for the preloader (see the script in <head>) to lift, so they are seen.
  var intro = [];
  var whenReady = window.mkdReady || function (fn) { fn(); };

  // Hero headline: lines rise in once on load.
  if ($(".hero h1")) {
    intro.push(gsap.from(".hero h1 .line > span", { yPercent: 110, duration: 1.1, ease: "power4.out", stagger: 0.12, delay: 0.1, paused: true }));
    intro.push(gsap.from(".hero-side > *", { opacity: 0, y: 18, duration: 0.9, ease: "power3.out", stagger: 0.08, delay: 0.45, paused: true }));
  }

  // Hero slideshow fades in on load.
  var media = $("[data-hero-media]");
  if (media) {
    intro.push(gsap.from(media, { opacity: 0, y: 16, duration: 0.9, ease: "power3.out", delay: 0.05, paused: true }));
  }

  var mm = gsap.matchMedia();

  // Story: pin and travel sideways on wider screens.
  mm.add("(min-width: 1021px)", function () {
    var story = $(".story"), track = $("[data-story-track]");
    if (!story || !track) return;
    story.classList.add("is-pinned");
    var dist = function () { return track.scrollWidth - window.innerWidth; };
    var tween = gsap.to(track, {
      x: function () { return -dist(); }, ease: "none",
      scrollTrigger: { trigger: story, start: "top top", end: function () { return "+=" + dist(); }, pin: true, scrub: 0.6, invalidateOnRefresh: true, anticipatePin: 1 }
    });
    $$(".story-panel figure img", track).forEach(function (img) {
      gsap.fromTo(img, { scale: 1.18 }, { scale: 1, ease: "none", scrollTrigger: { trigger: img.closest(".story-panel"), containerAnimation: tween, start: "left right", end: "right left", scrub: true } });
    });
    return function () { story.classList.remove("is-pinned"); gsap.set(track, { clearProps: "transform" }); };
  });

  // Brands: each card sinks back as the next one slides over it.
  mm.add("(min-width: 1021px)", function () {
    var cards = $$("[data-brand]");
    cards.forEach(function (card, i) {
      var next = cards[i + 1];
      if (!next) return;
      gsap.fromTo(card, { scale: 1, filter: "brightness(1)" }, { scale: 0.97, filter: "brightness(0.9)", ease: "none", scrollTrigger: { trigger: next, start: "top bottom", end: "top " + (72 + 40) + "px", scrub: true } });
    });
  });

  // Diwali photograph settles as it scrolls through.
  var dm = $("[data-diwali-media] img");
  if (dm) gsap.fromTo(dm, { scale: 1.14 }, { scale: 1, ease: "none", scrollTrigger: { trigger: dm, start: "top bottom", end: "center center", scrub: true } });

  // Global: background drifts, route draws from Kanpur outwards.
  var bg = $("[data-parallax]");
  if (bg) gsap.fromTo(bg, { yPercent: -6 }, { yPercent: 6, ease: "none", scrollTrigger: { trigger: bg.parentElement, start: "top bottom", end: "bottom top", scrub: true } });
  var route = $("[data-route]");
  if (route) {
    var len = route.getTotalLength();
    gsap.fromTo(route, { strokeDasharray: len, strokeDashoffset: len }, { strokeDashoffset: 0, ease: "none", scrollTrigger: { trigger: route.closest(".route"), start: "top 85%", end: "top 35%", scrub: true } });
  }

  // Products: Devanagari word drifts up slightly inside each card.
  $$(".product:not(.product-kit) .dev").forEach(function (el) {
    gsap.fromTo(el, { y: 40 }, { y: 0, ease: "none", scrollTrigger: { trigger: el.closest(".product"), start: "top bottom", end: "top 40%", scrub: true } });
  });

  // Sacred Selections: title rises, photographs settle as they pass.
  if ($("[data-sel-title]")) {
    intro.push(gsap.from("[data-sel-title]", { y: 40, opacity: 0, duration: 1.1, ease: "power4.out", paused: true }));
    intro.push(gsap.from(".sel-hero p, .sel-tags", { y: 20, opacity: 0, duration: 0.9, ease: "power3.out", stagger: 0.1, delay: 0.3, paused: true }));
    $$(".sel-hero figure img, .sel-split figure img").forEach(function (img) {
      gsap.fromTo(img, { scale: 1.15 }, { scale: 1, ease: "none", scrollTrigger: { trigger: img.parentElement, start: "top bottom", end: "bottom top", scrub: true } });
    });
    var cta = $(".sel-cta > img");
    if (cta) gsap.fromTo(cta, { yPercent: -8, scale: 1.1 }, { yPercent: 8, ease: "none", scrollTrigger: { trigger: cta.parentElement, start: "top bottom", end: "bottom top", scrub: true } });
  }

  whenReady(function () { intro.forEach(function (t) { t.play(); }); });

  window.addEventListener("load", function () { ScrollTrigger.refresh(); });
})();
