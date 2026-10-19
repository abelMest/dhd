// Share images (1200x630) rendered at build time, so every edition gets its own LinkedIn/WhatsApp/X preview.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

const require = createRequire(import.meta.url);
const font = (pkg: string, file: string) => readFileSync(require.resolve(`${pkg}/files/${file}`));
const FONTS = [
  { name: 'Newsreader', data: font('@fontsource/newsreader', 'newsreader-latin-500-normal.woff'), weight: 500 as const, style: 'normal' as const },
  { name: 'Spartan', data: font('@fontsource/league-spartan', 'league-spartan-latin-700-normal.woff'), weight: 700 as const, style: 'normal' as const },
];

const INK = '#0b1c2a', PAPER = '#ffffff', BRAND = '#298fc9', MUTED = '#5a6b7a';

// Satori takes a React-like element tree; plain objects avoid needing JSX in a .ts file.
type Node = { type: string; props: Record<string, unknown> & { children?: unknown } };
const h = (type: string, style: Record<string, unknown>, children?: unknown): Node => ({ type, props: { style, children } });

export async function ogImage({ kicker, title, footer }: { kicker: string; title: string; footer: string }) {
  const size = title.length > 90 ? 58 : title.length > 60 ? 66 : 76;
  const tree = h('div', { width: 1200, height: 630, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: PAPER, padding: '60px 72px 56px', borderTop: `14px solid ${BRAND}`, boxSizing: 'border-box' }, [
    h('div', { display: 'flex', alignItems: 'center', gap: 18, fontFamily: 'Spartan', fontSize: 26, letterSpacing: 3, color: INK, textTransform: 'uppercase' }, [
      { type: 'svg', props: { width: 44, height: 44, viewBox: '0 0 32 32', children: { type: 'path', props: { d: 'M2 18h7l3-9 5 18 4-14 2 5h7', fill: 'none', stroke: BRAND, strokeWidth: 2.6, strokeLinecap: 'round', strokeLinejoin: 'round' } } } },
      'Digital Health Digest',
    ]),
    h('div', { display: 'flex', flexDirection: 'column', gap: 22, width: 1056 }, [
      h('div', { fontFamily: 'Spartan', fontSize: 24, letterSpacing: 4, color: BRAND, textTransform: 'uppercase' }, kicker),
      h('div', { display: 'flex', width: 1056, fontFamily: 'Newsreader', fontSize: size, lineHeight: 1.08, color: INK, letterSpacing: -1 }, title),
    ]),
    h('div', { display: 'flex', width: 1056, minHeight: 30, fontFamily: 'Spartan', fontSize: 24, color: MUTED, letterSpacing: 1 }, footer),
  ]);
  const svg = await satori(tree as never, { width: 1200, height: 630, fonts: FONTS });
  return new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();
}
