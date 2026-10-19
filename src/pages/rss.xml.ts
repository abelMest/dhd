import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { loadSite, authorsFor } from '../lib/data';
import { renderMarkdown } from '../lib/markdown';

export async function GET(context: APIContext) {
  const site = await loadSite();
  return rss({
    title: 'Digital Health Digest',
    description: site.copy.lede,
    site: context.site!,
    items: site.articles.slice(0, 50).map((a) => ({
      title: a.title,
      link: `/editions/${a.id}/`,
      pubDate: new Date(a.publishedAt + 'T08:00:00Z'),
      description: a.dek,
      categories: [a.topic],
      author: authorsFor(site, a).map((x) => x.name).join(', ') || undefined,
      content: a.body ? renderMarkdown(a.body) : undefined,
    })),
    customData: '<language>en</language>',
  });
}
