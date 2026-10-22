// Share images (1200x630) rendered at build time: the picture that appears when a link is shared on
// LinkedIn, WhatsApp, X or Slack. Bold and colourful so the Digest stands out in a feed:
//   - an edition's own picture fills the right side; a deep navy panel carries the title in white;
//   - every topic has its own bright colour (pill, glow and bottom stripe), so topics read at a glance;
//   - pages without a picture get a large glowing heartbeat in their colour; author pages show the photo.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { substackImage } from './images';

const require = createRequire(import.meta.url);
const font = (pkg: string, file: string) => readFileSync(require.resolve(`${pkg}/files/${file}`));
const FONTS = [
  { name: 'Spartan', data: font('@fontsource/league-spartan', 'league-spartan-latin-700-normal.woff'), weight: 700 as const, style: 'normal' as const },
  { name: 'Spartan', data: font('@fontsource/league-spartan', 'league-spartan-latin-800-normal.woff'), weight: 800 as const, style: 'normal' as const },
  { name: 'Newsreader', data: font('@fontsource/newsreader', 'newsreader-latin-500-normal.woff'), weight: 500 as const, style: 'normal' as const },
];

const NAVY = '#071a29', NAVY2 = '#0f2d45', WHITE = '#ffffff', SOFT = '#b8c7d3', BRAND = '#298fc9';

/** One vivid colour per topic (and per page), used for the pill, the glow and the stripe. */
export const ACCENTS: Record<string, string> = {
  'Systems & interoperability': '#2fa8ff',
  'AI & data': '#9b7bff',
  'Policy & financing': '#ffb53d',
  'Public health': '#2fd08a',
  'Health workforce': '#ff6f61',
  'Supply chain & logistics': '#22d3e0',
};
export const accentFor = (topic: string) => ACCENTS[topic] || BRAND;

type Node = { type: string; props: Record<string, unknown> & { children?: unknown } };
const h = (type: string, style: Record<string, unknown>, children?: unknown, extra: Record<string, unknown> = {}): Node =>
  ({ type, props: { style, children, ...extra } });
const beat = (color: string, width: number, height: number, stroke: number) =>
  ({ type: 'svg', props: { width, height, viewBox: '0 0 32 32', children: { type: 'path', props: { d: 'M2 18h7l3-9 5 18 4-14 2 5h7', fill: 'none', stroke: color, strokeWidth: stroke, strokeLinecap: 'round', strokeLinejoin: 'round' } } } });

/** Downloads a picture and fits it to w×h as a JPEG data URL. null on any failure (the card then has no picture). */
async function picture(src: string, w: number, h: number): Promise<string | null> {
  if (!src) return null;
  try {
    const url = substackImage(src)?.at(1200) || src;
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) return null;
    const sharp = (await import('sharp')).default;
    const jpg = await sharp(Buffer.from(await r.arrayBuffer())).resize(w, h, { fit: 'cover', position: 'attention' }).jpeg({ quality: 82 }).toBuffer();
    return `data:image/jpeg;base64,${jpg.toString('base64')}`;
  } catch {
    return null;
  }
}

const brandRow = h('div', { display: 'flex', alignItems: 'center', gap: 14, fontFamily: 'Spartan', fontWeight: 800, fontSize: 24, letterSpacing: 3, color: WHITE, textTransform: 'uppercase' },
  [beat(BRAND, 40, 40, 3), 'Digital Health Digest']);

export interface OgInput {
  kicker: string; title: string; footer: string;
  /** Topic or page colour (defaults to the brand blue). */
  accent?: string;
  /** Picture to show: an edition's image (right half) or an author's photo (round). */
  image?: string; imageShape?: 'side' | 'round';
}

export async function ogImage({ kicker, title, footer, accent = BRAND, image = '', imageShape = 'side' }: OgInput) {
  const side = imageShape === 'side' ? await picture(image, 520, 630) : null;
  const round = imageShape === 'round' ? await picture(image, 300, 300) : null;
  const textW = side ? 600 : 700;   // leaves the right side to the picture, photo or heartbeat
  const len = title.length;
  const size = side ? (len > 95 ? 44 : len > 70 ? 50 : len > 45 ? 58 : 66) : (len > 95 ? 52 : len > 70 ? 60 : len > 45 ? 70 : 82);

  const pill = h('div', { display: 'flex', alignSelf: 'flex-start', padding: '9px 18px 7px', borderRadius: 999, background: accent, color: NAVY, fontFamily: 'Spartan', fontWeight: 800, fontSize: 20, letterSpacing: 2.5, textTransform: 'uppercase' }, kicker);
  const heading = h('div', { display: 'flex', width: textW, fontFamily: 'Spartan', fontWeight: 800, fontSize: size, lineHeight: 1.04, color: WHITE, letterSpacing: -0.5 }, title);
  const foot = h('div', { display: 'flex', alignItems: 'center', gap: 14, width: textW, fontFamily: 'Spartan', fontWeight: 700, fontSize: 22, color: SOFT, letterSpacing: 0.5 },
    [h('div', { width: 34, height: 4, borderRadius: 4, background: accent }), footer || 'digitalhealthdigest.africa']);

  const children: unknown[] = [
    // Glow in the accent colour behind everything.
    h('div', { position: 'absolute', left: side ? 260 : 620, top: -160, width: 760, height: 760, borderRadius: 760,
      backgroundImage: `radial-gradient(circle, ${accent}55 0%, ${accent}00 70%)` }),
    // Text column.
    h('div', { position: 'absolute', left: 64, top: 52, bottom: 58, width: textW, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' },
      [brandRow, h('div', { display: 'flex', flexDirection: 'column', gap: 22 }, [pill, heading]), foot]),
  ];
  if (side) {
    children.push(
      h('img', { position: 'absolute', right: 0, top: 0, width: 520, height: 630, objectFit: 'cover' }, undefined, { src: side, width: 520, height: 630 }),
      // Blend the picture into the navy panel.
      h('div', { position: 'absolute', right: 380, top: 0, width: 140, height: 630, backgroundImage: `linear-gradient(90deg, ${NAVY} 0%, ${NAVY}00 100%)` }),
    );
  } else if (round) {
    children.push(
      h('div', { position: 'absolute', right: 80, top: 165, width: 300, height: 300, borderRadius: 300, border: `8px solid ${accent}`, display: 'flex', overflow: 'hidden' },
        h('img', { width: 284, height: 284, borderRadius: 284 }, undefined, { src: round, width: 284, height: 284 })),
    );
  } else {
    // No picture: a big glowing heartbeat in the accent colour.
    children.push(h('div', { position: 'absolute', right: 40, top: 150, display: 'flex', opacity: 0.95 }, beat(accent, 360, 360, 1.6)));
  }
  // Bright stripe along the bottom.
  children.push(h('div', { position: 'absolute', left: 0, right: 0, bottom: 0, height: 12, backgroundImage: `linear-gradient(90deg, ${accent} 0%, ${BRAND} 100%)` }));

  const tree = h('div', { width: 1200, height: 630, display: 'flex', position: 'relative', overflow: 'hidden',
    backgroundImage: `linear-gradient(135deg, ${NAVY} 0%, ${NAVY2} 100%)` }, children);
  const svg = await satori(tree as never, { width: 1200, height: 630, fonts: FONTS });
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();
  const sharp = (await import('sharp')).default;
  return sharp(png).jpeg({ quality: 84, mozjpeg: true, chromaSubsampling: '4:4:4' }).toBuffer();
}
