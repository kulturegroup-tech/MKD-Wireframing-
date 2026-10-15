/* The Sacred Thought: content/stories/*.md -> dist/stories/<name>.html, dist/stories.html and the home page cards.
 *
 * Header fields (the admin fills these in):
 *   title, date, category (people | journal | md | press), excerpt,
 *   cover, cover_alt, cover_caption, person, role,
 *   video (YouTube plays in the page; any other link becomes a "Watch the video" button),
 *   link + source (press: the card opens the outside article), draft (true keeps it off the site).
 * Files whose name starts with "_" are templates and never published. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { CONTENT, DIST, DOMAIN, esc, fmtDate, isoDate, rel, readFront, markdown, fill, listFiles, youtubeId } from "./lib.mjs";

export const STORY_CATEGORIES = { people: "People", journal: "Journal", md: "Minutes with the MD", press: "In the media" };

export function buildStories() {
  const dir = join(CONTENT, "stories");
  const stories = [];
  for (const file of listFiles(dir, ".md")) {
    const { meta, body } = readFront(join(dir, file));
    if (meta.draft === true || meta.draft === "true") continue;
    if (!meta.title || !meta.date) { console.warn(`  skipped ${file}: needs a title and a date`); continue; }
    const category = STORY_CATEGORIES[meta.category] ? meta.category : "journal";
    stories.push({
      slug: file.replace(/\.md$/, ""), body, category,
      title: String(meta.title), date: isoDate(meta.date), excerpt: meta.excerpt ? String(meta.excerpt) : "",
      cover: meta.cover || "", coverAlt: meta.cover_alt || "", coverCaption: meta.cover_caption || "",
      person: meta.person || "", role: meta.role || "",
      video: meta.video || "", videoId: youtubeId(meta.video),
      link: meta.link || "", source: meta.source || "",
    });
  }
  stories.sort((a, b) => b.date.localeCompare(a.date));

  /* header and footer are copied from products.html so every page matches */
  const products = readFileSync(join(DIST, "products.html"), "utf8");
  const headTags = products.match(/<link rel="preconnect"[\s\S]*?<link rel="stylesheet" href="styles\.css">/)[0];
  const header = products.slice(products.indexOf('<div class="bar"'), products.indexOf("</header>") + 9).replace(/ aria-current="page"/g, "");
  const footer = products.slice(products.indexOf('<footer class="footer">'), products.indexOf("</footer>") + 9);
  const deeper = (html) => html.replace(/(href|src)="(?!https?:|mailto:|tel:|#|\/|data:)([^"]+)"/g, '$1="../$2"');
  const markCurrent = (html) => html.replace(/<a href="((?:\.\.\/)?stories\.html)">/g, '<a href="$1" aria-current="page">');

  const card = (s, prefix = "", tag = "h3") => {
    const ext = !!s.link;
    const href = ext ? s.link : `${prefix}stories/${s.slug}.html`;
    const kicker = `${STORY_CATEGORIES[s.category]}${s.source ? " · " + esc(s.source) : ""} · ${fmtDate(s.date)}`;
    const media = s.cover
      ? `<figure><img src="${esc(rel(s.cover, prefix))}" alt="" loading="lazy">${s.video ? '<span class="story-play" aria-hidden="true">Watch</span>' : ""}</figure>`
      : `<figure class="story-card-type" aria-hidden="true"><span>${esc(s.source || STORY_CATEGORIES[s.category])}</span></figure>`;
    return `<a class="story-card" data-cat="${s.category}" href="${esc(href)}"${ext ? ' target="_blank" rel="noopener"' : ""}>
  ${media}
  <span class="story-kicker">${kicker}</span>
  <${tag}>${esc(s.title)}</${tag}>
  <p>${esc(s.excerpt)}</p>
  <span class="story-more">${ext ? "Read the article" : s.video ? "Watch" : "Read the story"}</span>
</a>`;
  };

  const page = ({ title, description, canonical, image, body, deep, type = "website", extraHead = "" }) => {
    const p = deep ? "../" : "";
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">
<meta name="theme-color" content="#24170f">
<link rel="icon" href="${p}favicon.svg" type="image/svg+xml">
<link rel="icon" href="${p}favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="${p}apple-touch-icon.png">
<meta property="og:type" content="${type}">
<meta property="og:site_name" content="Maa Kamakhya Darbar Fragrances">
<meta property="og:locale" content="en_IN">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${image}">
<meta name="twitter:card" content="summary_large_image">
${deep ? deeper(headTags) : headTags}
${extraHead}</head>
<body>

${markCurrent(deep ? deeper(header) : header)}

${body}

${deep ? deeper(footer) : footer}

<script src="${p}site.js"></script>
<script src="${p}cart.js"></script>
</body>
</html>
`;
  };

  /* one page per story */
  mkdirSync(join(DIST, "stories"), { recursive: true });
  for (const s of stories.filter((x) => !x.link)) {
    const more = stories.filter((x) => x.slug !== s.slug && x.category !== "press").slice(0, 3);
    const top = s.videoId
      ? `<div class="post-video wrap" data-yt="${s.videoId}"><button type="button" aria-label="Play video: ${esc(s.title)}"><img src="https://i.ytimg.com/vi/${s.videoId}/hqdefault.jpg" alt=""><span class="video-btn">Play</span></button></div>`
      : s.cover
        ? `<figure class="post-cover wrap"><img src="${esc(rel(s.cover, "../"))}" alt="${esc(s.coverAlt)}">${s.coverCaption ? `<figcaption>${esc(s.coverCaption)}</figcaption>` : ""}</figure>`
        : "";
    const watch = s.video && !s.videoId
      ? `<p class="post-watch wrap"><a class="btn btn-primary" href="${esc(s.video)}" target="_blank" rel="noopener">Watch the video</a></p>` : "";
    const coverUrl = s.cover ? (/^https?:/.test(s.cover) ? s.cover : `${DOMAIN}/${rel(s.cover)}`) : `${DOMAIN}/brand/share.jpg`;
    const ld = {
      "@context": "https://schema.org", "@type": "Article", headline: s.title, description: s.excerpt, datePublished: s.date, image: coverUrl,
      publisher: { "@type": "Organization", name: "Maa Kamakhya Darbar Fragrances", logo: { "@type": "ImageObject", url: `${DOMAIN}/brand/mkd-logo.png` } },
      mainEntityOfPage: `${DOMAIN}/stories/${s.slug}.html`,
    };
    const body = `<main class="post">
  <header class="post-head wrap">
    <a class="post-back" href="../stories.html">The Sacred Thought</a>
    <p class="post-kicker">${STORY_CATEGORIES[s.category]} · ${fmtDate(s.date)}</p>
    <h1>${esc(s.title)}</h1>
    ${s.person ? `<p class="post-person"><b>${esc(s.person)}</b>${s.role ? `, ${esc(s.role)}` : ""}</p>` : ""}
    ${s.excerpt ? `<p class="lede">${esc(s.excerpt)}</p>` : ""}
  </header>
  ${top}
  ${watch}
  <article class="post-body wrap">
${markdown(s.body, "../")}
  </article>
  ${more.length ? `<section class="post-more" aria-labelledby="more-title"><div class="wrap">
    <h2 id="more-title">More from The Sacred Thought</h2>
    <div class="story-grid">${more.map((x) => card(x, "../")).join("\n")}</div>
  </div></section>` : ""}
</main>`;
    writeFileSync(join(DIST, "stories", `${s.slug}.html`), page({
      title: `${s.title} | The Sacred Thought`, description: s.excerpt, deep: true, type: "article",
      canonical: `${DOMAIN}/stories/${s.slug}.html`, image: coverUrl, body,
      extraHead: `<script type="application/ld+json">${JSON.stringify(ld)}</script>\n`,
    }));
  }

  /* the list page */
  const used = Object.keys(STORY_CATEGORIES).filter((c) => stories.some((s) => s.category === c));
  writeFileSync(join(DIST, "stories.html"), page({
    title: "The Sacred Thought | Stories from Tiranga and Sacred",
    description: "Stories from the people who make Tiranga and Sacred incense in Kanpur: our artisans, our family and conversations with our MD.",
    canonical: `${DOMAIN}/stories.html`, image: `${DOMAIN}/brand/share.jpg`,
    body: `<main class="stories-page">
  <section class="stories-head">
    <div class="wrap">
      <p class="kicker">The Sacred Thought</p>
      <h1>Tiranga is all about the people</h1>
      <p class="lede">Stories from our floors, our families and the people who carry Desh ki Khushboo across India. New ones are added as we meet them.</p>
      ${used.length > 1 ? `<div class="story-filters" role="group" aria-label="Filter stories" data-story-filters>
        <button type="button" aria-pressed="true" data-filter="all">All</button>
        ${used.map((c) => `<button type="button" aria-pressed="false" data-filter="${c}">${STORY_CATEGORIES[c]}</button>`).join("\n        ")}
      </div>` : ""}
    </div>
  </section>
  <section class="stories-list">
    <div class="wrap">
      <div class="story-grid" data-story-grid>
${stories.map((s) => card(s, "", "h2")).join("\n")}
      </div>
      <p class="stories-note">Have a story about Tiranga or Sacred? Write to <a class="link" href="mailto:contact@mkdtiranga.com">contact@mkdtiranga.com</a>.</p>
    </div>
  </section>
</main>`,
  }));

  /* home page cards */
  let index = readFileSync(join(DIST, "index.html"), "utf8");
  const people = stories.filter((s) => s.category === "people" || s.category === "journal").slice(0, 3);
  index = fill(index, "people", people.map((s) => card(s)).join("\n"));
  const md = stories.filter((s) => s.category === "md").slice(0, 3);
  index = fill(index, "md", md.length
    ? `<div class="md-episodes">${md.map((s) => card(s)).join("\n")}</div>`
    : `<p class="md-empty">The first episodes are on their way. Follow them here.</p>`);
  const press = stories.filter((s) => s.category === "press").slice(0, 4);
  index = fill(index, "press", press.map((s) => `<a class="press-item" href="${esc(s.link || `stories/${s.slug}.html`)}"${s.link ? ' target="_blank" rel="noopener"' : ""}>
  <span class="press-source">${esc(s.source || "Tiranga")} · ${fmtDate(s.date)}</span>
  <span class="press-head">${esc(s.title)}</span>
</a>`).join("\n"));
  writeFileSync(join(DIST, "index.html"), index);

  writeFileSync(join(DIST, "stories.json"), JSON.stringify(stories.map(({ body, ...s }) => s), null, 2));
  return stories;
}
