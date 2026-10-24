// Image helpers shared by the Markdown renderer and the edition cards.

// Substack's image CDN encodes the original size in the file name (…_2752x1536.png) and resizes on request,
// so imported images can be sized (no layout jump) and served at the width each place needs.
const SUBSTACK_CDN = /^https:\/\/substackcdn\.com\/image\/fetch\/([^/]*)\/(.+)$/;

export function substackImage(src: string) {
  const m = SUBSTACK_CDN.exec(src);
  if (!m) return null;
  const size = /_(\d{2,5})x(\d{2,5})\.[a-z]+$/i.exec(decodeURIComponent(m[2]));
  const at = (w: number) => `https://substackcdn.com/image/fetch/${m[1].replace(/w_\d+/, `w_${w}`).replace(/^(?!.*w_)/, `w_${w},`)}/${m[2]}`;
  return { size: size ? { w: +size[1], h: +size[2] } : null, at };
}

/** The first image in an edition's Markdown body, used as its card picture. */
export function firstImage(md: string): string {
  const m = /!\[[^\]]*\]\((\S+?)(?:\s+"[^"]*")?\)/.exec(md || '');
  return m ? m[1] : '';
}

/** src and srcset for a card thumbnail at the given display width. Non-Substack images pass through. */
export function thumb(src: string, displayWidth: number) {
  const cdn = substackImage(src);
  if (!cdn) return { src, srcset: undefined as string | undefined };
  // A range of widths so phones download phone-sized pictures; the browser picks from `sizes`.
  const max = Math.min(1456, displayWidth * 2);
  const widths = [...new Set([360, 480, 640, 800, 960, 1104, 1280, 1456, displayWidth].filter((w) => w <= max).map((w) => Math.round(w / 8) * 8))].sort((x, y) => x - y);
  return { src: cdn.at(Math.min(1456, Math.round(displayWidth / 8) * 8)), srcset: widths.map((w) => `${cdn.at(w)} ${w}w`).join(', ') };
}
