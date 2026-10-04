/* Shared helpers for the build scripts. */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { marked } from "marked";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const DIST = join(ROOT, "dist");
export const CONTENT = join(ROOT, "content");
/** Change this one line if the site moves to another address. */
export const DOMAIN = "https://www.mkdtiranga.com";

export const esc = (s = "") => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const fmtDate = (d) => {
  const t = new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(d)) ? d + "T00:00:00Z" : d);
  return isNaN(t) ? String(d) : t.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
};

/** Dates from the admin may be Date objects (YAML) or strings: always return YYYY-MM-DD. */
export const isoDate = (d) => {
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  const s = String(d || "");
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : s;
};

/** Image and link paths from the admin start with "/" (e.g. /uploads/products/x.webp).
 *  Pages use relative paths so the site also works from a sub-folder or a preview. */
export const rel = (p, prefix = "") => {
  if (!p) return "";
  if (/^(https?:|mailto:|tel:|#|data:)/.test(p)) return p;
  return prefix + String(p).replace(/^\.?\//, "");
};

export function readJson(file, fallback = null) {
  try { return JSON.parse(readFileSync(file, "utf8")); } catch (e) {
    if (existsSync(file)) console.warn(`  could not read ${file}: ${e.message}`);
    return fallback;
  }
}

export function listFiles(dir, ext) {
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(ext) && !f.startsWith("_") && !f.startsWith(".")) : [];
}

/** Markdown file with a YAML block between --- lines at the top. */
export function readFront(file) {
  const text = readFileSync(file, "utf8");
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: text };
  let meta = {};
  try { meta = yaml.load(m[1]) || {}; } catch (e) { console.warn(`  bad header in ${file}: ${e.message}`); }
  return { meta, body: m[2] };
}

/** Markdown to HTML, with relative image/link paths re-pointed for pages in sub-folders. */
export function markdown(md, prefix = "") {
  const html = marked.parse(String(md || ""), { gfm: true, breaks: false });
  return html
    .replace(/(src|href)="(?!https?:|mailto:|tel:|#|data:)\/?([^"]+)"/g, (_, a, p) => `${a}="${prefix}${p}"`)
    .replace(/<a href="(https?:[^"]+)"/g, '<a class="link" href="$1" target="_blank" rel="noopener"')
    .replace(/<img /g, '<img loading="lazy" ')
    .replace(/<p>(<img [^>]+>)<\/p>/g, '<figure class="post-figure">$1</figure>');
}

/** Replace what sits between <!-- build:name --> and <!-- /build:name --> in a page. */
export function fill(html, name, content) {
  const re = new RegExp(`(<!-- build:${name} -->)[\\s\\S]*?(<!-- /build:${name} -->)`, "g");
  return html.replace(re, `$1\n${content}\n$2`);
}

export function youtubeId(url = "") {
  const m = String(url || "").match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([\w-]{11})/);
  return m ? m[1] : null;
}
