/* The page shell (head, header with the cart button, footer, scripts), copied from products.html
 * so generated pages (product pages, policy pages, checkout) always match the hand-made ones. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DIST, DOMAIN, esc } from "./lib.mjs";

/** Pages one folder down (product/, stories/) need "../" in front of relative links. */
export const deeper = (html) => html.replace(/(href|src)="(?!https?:|mailto:|tel:|#|\/|data:|\.\.\/)([^"]+)"/g, '$1="../$2"');

export function pageShell() {
  const products = readFileSync(join(DIST, "products.html"), "utf8");
  const headTags = products.match(/<link rel="preconnect"[\s\S]*?<link rel="stylesheet" href="styles\.css">/)[0];
  const header = products.slice(products.indexOf('<div class="bar"'), products.indexOf("</header>") + 9).replace(/ aria-current="page"/g, "");
  const footer = products.slice(products.indexOf('<footer class="footer">'), products.indexOf("</footer>") + 9);

  return function shell({ title, description, path, image, body, deep = false, current = "", type = "website", extraHead = "", scripts = [], noindex = false }) {
    const p = deep ? "../" : "";
    const canonical = `${DOMAIN}/${path}`;
    let head = deep ? deeper(header) : header;
    if (current) head = head.replace(new RegExp(`(<nav class="nav-links"[\\s\\S]*?<a href="(?:\\.\\./)?${current.replace(".", "\\.")}")`), '$1 aria-current="page"');
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${noindex ? '<meta name="robots" content="noindex">\n' : ""}<link rel="canonical" href="${canonical}">
<meta name="theme-color" content="#24170f">
<link rel="icon" href="${p}favicon.svg" type="image/svg+xml">
<link rel="icon" href="${p}favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="${p}apple-touch-icon.png">
<meta property="og:type" content="${type}">
<meta property="og:site_name" content="Tiranga Agarbatti">
<meta property="og:locale" content="en_IN">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${image || `${DOMAIN}/brand/share.jpg`}">
<meta name="twitter:card" content="summary_large_image">
${deep ? deeper(headTags) : headTags}
${extraHead}</head>
<body>

${head}

${body}

${deep ? deeper(footer) : footer}

<script src="${p}site.js"></script>
<script src="${p}cart.js"></script>
${scripts.map((s) => `<script src="${p}${s}"></script>`).join("\n")}
</body>
</html>
`;
  };
}
