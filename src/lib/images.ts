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
  const widths = [displayWidth, displayWidth * 2].map((w) => Math.min(1456, Math.round(w / 8) * 8));
  return { src: cdn.at(widths[0]), srcset: widths.map((w) => `${cdn.at(w)} ${w}w`).join(', ') };
}
