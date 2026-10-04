/* Home page content from the admin: leadership, awards and the Diwali kit offer. Works on the copy in dist/. */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { CONTENT, DIST, readJson, esc, rel, fill } from "./lib.mjs";

export function buildSite() {
  const site = join(CONTENT, "site");
  const leaders = readJson(join(site, "leaders.json"), { leaders: [] }).leaders || [];
  const awards = readJson(join(site, "awards.json"), { awards: [] }).awards || [];
  const diwali = readJson(join(site, "diwali.json"), {});

  let index = readFileSync(join(DIST, "index.html"), "utf8");
  index = fill(index, "leaders", leaders.map((l) => `        <article class="leader">
          <figure>${l.photo ? `<img src="${esc(rel(l.photo))}" alt="${esc(l.photo_alt || `${l.name}, ${l.role}`)}" loading="lazy">` : ""}</figure>
          <div class="leader-copy">
            <p class="leader-role">${esc(l.role)}</p>
            <h3>${esc(l.name)}</h3>
            ${l.bio ? `<p>${esc(l.bio)}</p>` : ""}
            ${l.link_url && l.link_label ? `<a class="link" href="${esc(rel(l.link_url))}">${esc(l.link_label)}</a>` : ""}
          </div>
        </article>`).join("\n"));
  index = fill(index, "awards", awards.map((a) => `          <article class="award">
            <span class="award-year">${esc(a.year)}</span>
            <div><h3>${esc(a.title)}</h3>${a.text ? `<p>${esc(a.text)}</p>` : ""}</div>
          </article>`).join("\n"));

  // Diwali kit: order link and countdown text on the home page
  if (diwali.kit_url) index = index.replace(/(<a [^>]*data-kit-link[^>]*href=")[^"]*(")/g, `$1${esc(diwali.kit_url)}$2`)
                                   .replace(/(<a [^>]*href=")[^"]*("[^>]*data-kit-link)/g, `$1${esc(diwali.kit_url)}$2`);
  const t = new Date(diwali.puja_time || "");
  if (!isNaN(t)) {
    const label = t.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" });
    index = index.replace(/(<p data-puja-label>)[^<]*(<\/p>)/, `$1until Lakshmi Puja, ${label}$2`);
  }
  writeFileSync(join(DIST, "index.html"), index);

  // every page: the countdown date, and the offer bar + floating pill switched on or off
  const pages = [DIST, join(DIST, "stories")].filter((d) => existsSync(d))
    .flatMap((d) => readdirSync(d).filter((f) => f.endsWith(".html")).map((f) => join(d, f)));
  for (const file of pages) {
    let html = readFileSync(file, "utf8");
    if (!isNaN(t)) html = html.replace(/<html lang="en"(?![^>]*data-diwali)/, `<html lang="en" data-diwali="${t.toISOString()}"`);
    if (diwali.show_offer === false) {
      html = html.replace(/<div class="bar"[\s\S]*?<\/div>\s*/, "").replace(/<a class="kit-pill"[\s\S]*?<\/a>\s*/, "");
    }
    writeFileSync(file, html);
  }
  return { leaders: leaders.length, awards: awards.length };
}
