// Share images for every edition, main page, topic and author (see lib/og.ts for the design).
// JPEG, so previews stay under WhatsApp's ~300 KB limit:
//   /og/<edition id>.jpg   /og/default.jpg (home)   /og/page-<name>.jpg   /og/topic-<slug>.jpg   /og/author-<id>.jpg
import type { APIContext } from 'astro';
import { loadSite, authorsFor, fmtDate } from '../../lib/data';
import { ogImage, accentFor, type OgInput } from '../../lib/og';
import { TOPICS, topicSlug } from '../../lib/taxonomy';

export async function getStaticPaths() {
  const site = await loadSite();
  const { settings } = site;
  const n = settings.editionsTotal;
  const editions = (k: number) => `${k} ${k === 1 ? 'edition' : 'editions'} on the Digital Health Digest`;
  const subs = settings.subscribers > 0 ? `${settings.subscribers.toLocaleString('en-GB')} subscribers` : '';
  const pages: { id: string; props: OgInput }[] = [
    { id: 'default', props: { kicker: 'Ideas · Resources · Opportunities', title: 'Ideas that move digital health forward.', footer: [`${n} editions`, subs, 'digitalhealthdigest.africa'].filter(Boolean).join('  ·  '), accent: '#2fa8ff' } },
    { id: 'page-start', props: { kicker: 'Start here', title: 'Getting into digital health: a free guide', footer: 'For students, clinicians, technologists and policy staff', accent: '#2fd08a' } },
    { id: 'page-editions', props: { kicker: 'The archive', title: `Every edition, in full: ${n} and counting`, footer: 'Interoperability, AI, financing, workforce and more', accent: '#9b7bff' } },
    { id: 'page-library', props: { kicker: 'Knowledge library', title: 'Guides, standards and research for digital health', footer: 'Searchable by topic, type, country and audience', accent: '#22d3e0' } },
    { id: 'page-opportunities', props: { kicker: 'Opportunity board', title: 'Fellowships, grants and calls in digital health', footer: 'Every listing checked against its source', accent: '#ffb53d' } },
    { id: 'page-partner', props: { kicker: 'Partner with us', title: 'Reach the people building digital health in Africa', footer: [subs, `${n} editions`].filter(Boolean).join('  ·  '), accent: '#ff6f61' } },
    { id: 'page-about', props: { kicker: 'About', title: 'Written by the people building health systems, for each other', footer: 'Our editors, contributors and editorial standard', accent: '#2fa8ff' } },
    { id: 'page-contribute', props: { kicker: 'Write for the Digest', title: 'Your field lesson belongs here', footer: 'Pitch an article, interview, case study or explainer', accent: '#2fd08a' } },
    ...TOPICS.map((t) => ({ id: `topic-${topicSlug(t)}`, props: {
      kicker: 'Topic', title: t, accent: accentFor(t),
      footer: editions(site.articles.filter((a) => a.topic === t).length),
    } })),
    ...site.authors.map((x) => ({ id: `author-${x.id}`, props: {
      kicker: x.role || 'Contributor', title: x.name, image: x.photoUrl, imageShape: 'round' as const,
      footer: editions(site.articles.filter((a) => a.authorIds.includes(x.id)).length),
    } })),
  ];
  return [
    ...pages.map((p) => ({ params: { id: p.id }, props: p.props })),
    ...site.articles.map((a) => ({
      params: { id: a.id },
      props: {
        kicker: a.topic, title: a.title, accent: accentFor(a.topic), image: a.image,
        footer: [authorsFor(site, a).map((x) => x.name).join(', '), fmtDate(a.publishedAt)].filter(Boolean).join('  ·  '),
      } satisfies OgInput,
    })),
  ];
}

export async function GET({ props }: APIContext) {
  const jpg = await ogImage(props as OgInput);
  return new Response(new Uint8Array(jpg), { headers: { 'Content-Type': 'image/jpeg' } });
}
