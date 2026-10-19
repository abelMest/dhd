// Default site text, carried over from v6. Editors override any key in Console → Site content.
// Keys tied to removed v6 features (heroRotate, latestSub, askTitle, askSub) are kept so imported data stays valid.

export const COPY_DEFAULTS = {
  heroL1: 'Ideas that move',
  heroRotate: 'digital health, interoperability, responsible AI, health financing, primary care, public health data',
  heroL3: 'forward.',
  lede: 'A collaborative publication and resource hub for people shaping health systems across Africa and beyond. Read the editions, find what you need, and bring your own work to the community.',
  latestTitle: 'Latest editions',
  latestSub: 'Every edition, in full, with links to the Substack and LinkedIn versions.',
  topicsTitle: 'Follow a topic',
  topicsSub: 'Six beats the Digest returns to. Pick one to see everything on it.',
  askTitle: 'Search the archive',
  askSub: 'Search every edition, resource and opportunity.',
  libTitle: 'Find what you need',
  libSub: 'Guides, standards, research and learning material, searchable by topic, type, country and audience.',
  oppTitle: 'Closing soon',
  builderTitle: 'Start a pitch in 20 seconds',
  builderSub: 'Pick a format and a topic, add a working title, and carry it straight into the full pitch form.',
  ctaTitle: 'Your field lesson belongs here.',
  ctaSub: 'Pitch an article, interview, case study or explainer. Accepted pieces carry your byline and bio, and reach readers on LinkedIn and Substack.',
  footerAbout: 'Ideas, resources and opportunities for people building health systems across Africa and beyond. Edited by Abel Mestie Mekonnen.',
  topics: 'Systems & interoperability, AI & data, Policy & financing, Public health, Health workforce, Supply chain & logistics',
  announce: '',
  announceUrl: '',
  subTitle: 'Get the Digest in your inbox',
  subSub: 'Free. One edition a week or so. Unsubscribe anytime.',
  pinsTitle: 'Essential reads',
  pinsSub: 'Three editions to start with. They hold up.',
  startTitle: 'Start here',
  startSub: 'Pick your role. We picked three editions for each.',
  aboutTitle: 'Who edits the Digest',
  aboutName: 'Dr. Abel Mestie Mekonnen',
  aboutBody: 'Abel is a physician and digital health strategist. He has led digital health programs in Ethiopia and across Africa for more than six years, from EMR rollouts in national health facilities to telemedicine operations. He started the Digest so the people doing this work have one place to share what works, what fails and why.',
  aboutRoles: 'Public Health Informatics Fellow, Africa CDC\nDigital Health Advisor, Federal Ministry of Health, Ethiopia\nFounder and Editor, Digital Health Digest',
  standardTitle: 'Our editorial standard',
  standard: 'Every claim links to a source you can check.\nEvery opportunity shows the date an editor last verified it against the source.\nGuest pieces pass an editor review before they publish.\nAuthors declare funding and affiliations relevant to their piece.\nWe correct errors in the open and date the correction.',
  partners: '',
  aboutPhoto: '',
};

export type CopyKey = keyof typeof COPY_DEFAULTS;
export type Copy = Record<CopyKey, string>;

// Blank values fall back to the default, as cv() did in v6.
export function withDefaults(stored: Partial<Record<string, unknown>>): Copy {
  const out = { ...COPY_DEFAULTS } as Copy;
  for (const k of Object.keys(COPY_DEFAULTS) as CopyKey[]) {
    const v = stored[k];
    if (typeof v === 'string' && v.trim()) out[k] = v;
  }
  return out;
}

export const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);
export const commaList = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
