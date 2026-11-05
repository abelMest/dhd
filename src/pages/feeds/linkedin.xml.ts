import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { loadSite } from '../../lib/data';

// Feed for the LinkedIn connector (Zapier or Make: "new item in RSS feed" -> "create LinkedIn page update").
// Each item carries a ready-to-post text, the edition's share image and a tracked link. Only editions published
// in the last 14 days appear, so setting up the connector, or importing old editions, never floods the page.
const WINDOW_DAYS = 14;
const TAGS: Record<string, string> = {
  'AI & data': '#AI #HealthData',
  'Systems & interoperability': '#Interoperability #HealthInformatics',
  'Policy & financing': '#HealthPolicy #HealthFinancing',
  'Public health': '#PublicHealth',
  'Health workforce': '#HealthWorkforce #Leadership',
  'Supply chain & logistics': '#SupplyChain #HealthLogistics',
};
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export async function GET(context: APIContext) {
  const site = await loadSite();
  const since = new Date(Date.now() - WINDOW_DAYS * 86400000).toISOString().slice(0, 10);
  const recent = site.articles.filter((a) => a.publishedAt >= since).slice(0, 10);
  return rss({
    title: 'Digital Health Digest: new editions for LinkedIn',
    description: 'New editions, formatted for posting to the Digital Health Digest LinkedIn page.',
    site: context.site!,
    xmlns: { media: 'http://search.yahoo.com/mrss/' },
    items: recent.map((a) => {
      const link = new URL(`/editions/${a.id}/?utm_source=linkedin&utm_medium=social&utm_campaign=new-edition`, context.site!).href;
      const image = new URL(`/og/${a.id}.jpg`, context.site!).href;
      const post = [`New edition: ${a.title}`, a.dek, `Read it free: ${link}`, `#DigitalHealth #Africa ${TAGS[a.topic] || ''}`.trim()]
        .filter(Boolean).join('\n\n');
      return {
        title: a.title,
        link,
        pubDate: new Date(a.publishedAt + 'T08:00:00Z'),
        description: post,
        categories: [a.topic],
        customData: `<media:content url="${esc(image)}" medium="image" type="image/jpeg" width="1200" height="630" />`,
        enclosure: { url: image, length: 0, type: 'image/jpeg' },
      };
    }),
    customData: '<language>en</language>',
  });
}
