import type { APIContext } from 'astro';
import { loadSite, authorsFor, fmtDate } from '../../lib/data';
import { ogImage } from '../../lib/og';

export async function getStaticPaths() {
  const site = await loadSite();
  return [
    { params: { id: 'default' }, props: { kicker: 'Ideas · Resources · Opportunities', title: 'Ideas that move digital health forward.', footer: 'For people building health systems across Africa and beyond' } },
    ...site.articles.map((a) => ({
      params: { id: a.id },
      props: {
        kicker: a.topic,
        title: a.title,
        footer: [authorsFor(site, a).map((x) => x.name).join(', '), fmtDate(a.publishedAt)].filter(Boolean).join('  ·  '),
      },
    })),
  ];
}

export async function GET({ props }: APIContext) {
  const png = await ogImage(props as { kicker: string; title: string; footer: string });
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } });
}
