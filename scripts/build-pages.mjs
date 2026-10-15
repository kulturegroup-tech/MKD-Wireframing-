/* Page text and images from the admin (content/site/home.json) -> the copies of the pages in dist/.
 *
 * In the HTML, an editable spot is marked with an attribute that names its place in home.json:
 *   data-cms="brands.tiranga.tagline"     replaces the text
 *   data-cms-src="brands.tiranga.image"   replaces an image
 *   data-cms-alt="brands.tiranga.alt"     replaces the image description
 *   data-cms-href="brands.tiranga.button_link"   replaces a link
 * Lists (hero slides, numbers, story timeline, making steps, Pushkar figures) are rebuilt
 * from home.json with the same markup the animations expect.
 * An empty field in the admin leaves the original text in place. */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import * as cheerio from "cheerio";
import { CONTENT, DIST, readJson, esc, rel } from "./lib.mjs";

const FOCUS = { center: "50% 50%", upper: "50% 28%", lower: "50% 66%" };
const fmtNum = (n) => Number(n).toLocaleString("en-IN");
const get = (data, path) => path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), data);
const cls = (s, i) => { const c = [i === 0 && "is-active", s.banner && "is-banner", s.image_mobile && "has-mobile"].filter(Boolean); return c.length ? ` class="${c.join(" ")}"` : ""; };
const filled = (v) => v !== undefined && v !== null && String(v).trim() !== "";

function apply($, data) {
  $("[data-cms]").each((_, el) => { const v = get(data, $(el).attr("data-cms")); if (filled(v)) $(el).text(String(v)); });
  $("[data-cms-src]").each((_, el) => { const v = get(data, $(el).attr("data-cms-src")); if (filled(v)) $(el).attr("src", rel(v)); });
  $("[data-cms-alt]").each((_, el) => { const v = get(data, $(el).attr("data-cms-alt")); if (v !== undefined && v !== null) $(el).attr("alt", String(v)); });
  $("[data-cms-href]").each((_, el) => { const v = get(data, $(el).attr("data-cms-href")); if (filled(v)) $(el).attr("href", rel(v)); });
}

function lists($, d) {
  const slides = (d.hero?.slides || []).filter((s) => s && s.image);
  if (slides.length) {
    $("[data-hero-slides]").html("\n" + slides.map((s, i) =>
      (s.image_mobile ? `        <picture><source media="(max-width: 640px)" srcset="${esc(rel(s.image_mobile))}">\n  ` : "") +
      `        <img${cls(s, i)} src="${esc(rel(s.image))}" data-caption="${s.banner ? "" : esc(s.caption || "")}"${s.link ? ` data-link="${esc(rel(s.link))}"` : ""}${s.until ? ` data-until="${esc(String(s.until).slice(0, 10))}"` : ""}${s.lead_until ? ` data-lead-until="${esc(String(s.lead_until).slice(0, 10))}"` : ""} alt="${esc(s.alt || "")}"` +
      `${!s.banner && FOCUS[s.focus] && s.focus !== "center" ? ` style="object-position:${FOCUS[s.focus]}"` : ""}${i ? ' loading="lazy"' : ' fetchpriority="high"'}>` + (s.image_mobile ? "</picture>" : "")).join("\n") + "\n      ");
    // the first slide decides how the slideshow starts (a banner has no caption or shading)
    $("[data-hero-media]").toggleClass("is-banner", !!slides[0].banner);
    if (slides[0].link) $("[data-hero-link]").attr("href", rel(slides[0].link)).attr("aria-label", slides[0].alt || "Open"); else $("[data-hero-link]").attr("hidden", "");
    $("[data-hero-dots]").html("\n" + slides.map((s, i) =>
      `        <button type="button" aria-label="Show slide ${i + 1}${s.caption ? `: ${esc(s.caption)}` : ""}" aria-pressed="${i === 0}"><i></i></button>`).join("\n") + "\n      ");
    if (slides.length < 2) $("[data-hero-dots]").attr("hidden", "");
    $("[data-hero-text] span").text(slides[0].banner ? "" : slides[0].caption || "");
  }

  const numbers = (d.numbers || []).filter((n) => n && filled(n.value));
  if (numbers.length) $(".numbers-grid").html("\n" + numbers.map((n) =>
    `      <div><strong data-count="${+n.value}"${n.suffix ? ` data-suffix="${esc(n.suffix)}"` : ""}>${fmtNum(n.value)}${esc(n.suffix || "")}</strong><span>${esc(n.label || "")}</span></div>`).join("\n") + "\n    ");

  const panels = (d.story?.panels || []).filter((p) => p && (p.title || p.image));
  if (panels.length) {
    $(".story-track .story-panel").remove();
    $(".story-track").append(panels.map((p) => `
      <article class="story-panel">
        <figure><img src="${esc(rel(p.image))}" alt="${esc(p.alt || "")}" loading="lazy"></figure>
        <div class="story-copy">
          <span class="story-year">${esc(p.year || "")}</span>
          <h3>${esc(p.title || "")}</h3>
          <p>${esc(p.text || "")}</p>
        </div>
      </article>`).join("") + "\n    ");
  }

  const steps = (d.making?.steps || []).filter((s) => s && (s.title || s.image));
  if (steps.length) {
    $(".making-media").html("\n" + steps.map((s, i) =>
      `          <img src="${esc(rel(s.image))}" alt=""${i === 0 ? ' class="is-active"' : ""} data-step-img="${i}">`).join("\n") +
      `\n          <div class="making-progress"><i data-step-progress></i></div>\n        `);
    $(".making-steps").html("\n" + steps.map((s, i) => `          <li class="making-step${i === 0 ? " is-active" : ""}" data-step="${i}">
            <img src="${esc(rel(s.image))}" alt="${esc(s.alt || "")}" loading="lazy">
            <span class="num">${i + 1}</span><h3>${esc(s.title || "")}</h3>
            <p>${esc(s.text || "")}</p>
          </li>`).join("\n") + "\n        ");
  }

  const figures = (d.pushkar?.figures || []).filter((f) => f && filled(f.value));
  if (figures.length) $(".proof-figures").html("\n" + figures.map((f) =>
    `        <div><strong data-count="${+f.value}">${fmtNum(f.value)}</strong><span>${esc(f.label || "")}</span></div>`).join("\n") + "\n      ");
}

export function buildPages() {
  const data = readJson(join(CONTENT, "site", "home.json"), {});
  let count = 0;
  for (const page of ["index.html", "products.html"]) {
    const file = join(DIST, page);
    if (!existsSync(file)) continue;
    const $ = cheerio.load(readFileSync(file, "utf8"), { xml: false }, true);
    apply($, data);
    if (page === "index.html") lists($, data);
    count += $("[data-cms],[data-cms-src]").length;
    writeFileSync(file, $.html());
  }
  return count;
}
