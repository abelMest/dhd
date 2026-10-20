import { Marked } from 'marked';
import { substackImage } from './images';

// Edition bodies are Markdown written by editors (or imported from Substack).
// Links to other sites open in a new tab, matching the "every claim links to a source" standard.
const md = new Marked({ gfm: true, breaks: false });
let imageCount = 0;
let headingIds = new Set<string>();

const stripTags = (s: string) => s.replace(/<[^>]+>/g, '').replace(/&[a-z#0-9]+;/gi, ' ');
export const headingSlug = (s: string) =>
  stripTags(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'section';

md.use({
  renderer: {
    image({ href, title, text }) {
      const lazy = imageCount++ > 0 ? ' loading="lazy"' : ' fetchpriority="high"';
      const alt = escapeAttr(text || '');
      const t = title ? ` title="${escapeAttr(title)}"` : '';
      const cdn = substackImage(href);
      if (!cdn) return `<img src="${escapeAttr(href)}" alt="${alt}"${t} decoding="async"${lazy}>`;
      const dims = cdn.size ? ` width="${cdn.size.w}" height="${cdn.size.h}" style="aspect-ratio:${cdn.size.w}/${cdn.size.h}"` : '';
      const srcset = [424, 848, 1272].map((w) => `${escapeAttr(cdn.at(w))} ${w}w`).join(', ');
      return `<img src="${escapeAttr(cdn.at(848))}" srcset="${srcset}" sizes="(max-width: 760px) 100vw, 720px" alt="${alt}"${t}${dims} decoding="async"${lazy}>`;
    },
    link({ href, title, tokens }) {
      const text = this.parser.parseInline(tokens);
      const ext = /^https?:\/\//.test(href);
      const t = title ? ` title="${escapeAttr(title)}"` : '';
      return `<a href="${escapeAttr(href)}"${t}${ext ? ' rel="noopener" target="_blank"' : ''}>${text}</a>`;
    },
    // Section headings get stable anchors so the table of contents and shared links can point at them.
    heading({ tokens, depth: raw }) {
      // The edition title is the page's only <h1>; a # heading in the body (common in Substack imports) becomes a section.
      const depth = Math.max(2, raw);
      const inner = this.parser.parseInline(tokens);
      if (depth !== 2) return `<h${depth}>${inner}</h${depth}>\n`;
      let id = headingSlug(inner), n = 2;
      while (headingIds.has(id)) id = `${headingSlug(inner)}-${n++}`;
      headingIds.add(id);
      return `<h2 id="${id}">${inner}</h2>\n`;
    },
  },
});

export function renderMarkdown(src: string): string {
  imageCount = 0;
  headingIds = new Set();
  const html = md.parse(src || '', { async: false }) as string;
  // A paragraph holding only an image becomes a figure. The first real paragraph gets a drop cap,
  // but only when it runs to three lines or more; a short one would let the capital spill into the next paragraph.
  return html
    .replace(/<p>(<img [^>]+>)<\/p>/g, '<figure>$1</figure>')
    .replace(/<p>(?!<img)([\s\S]*?)<\/p>/, (whole, inner: string) =>
      stripTags(inner).length >= 200 ? `<p class="opening">${inner}</p>` : whole);
}

/** The section headings of rendered HTML, for the table of contents. */
export function outline(html: string): { id: string; text: string }[] {
  return [...html.matchAll(/<h2 id="([^"]+)">([\s\S]*?)<\/h2>/g)].map((m) => ({ id: m[1], text: stripTags(m[2]).trim() }));
}

export function readingMinutes(src: string): number {
  const words = (src || '').replace(/[#>*_`\[\]()!-]/g, ' ').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

export function escapeAttr(s: string) {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
