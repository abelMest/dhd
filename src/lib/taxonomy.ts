// Fixed lists carried over from v6. Editors pick from these in the console.

export const TOPICS = [
  'Systems & interoperability',
  'AI & data',
  'Policy & financing',
  'Public health',
  'Health workforce',
  'Supply chain & logistics',
] as const;

export const RESOURCE_TYPES = [
  'Guide or toolkit',
  'Standard or specification',
  'Report or research',
  'Course or learning',
  'Dataset',
  'Open-source tool',
  'Policy document',
] as const;

export const OPP_KINDS = [
  'Fellowship', 'Job', 'Consultancy', 'Grant', 'Event', 'Call for papers', 'Training', 'Collaboration',
] as const;

export const AUDIENCES = ['Policymakers', 'Implementers', 'Clinicians', 'Researchers', 'Developers', 'Students'] as const;

// The home page's Start here tabs: the same four paths as the /start/ guide (guide = that section's anchor).
// `role` is what an edition's "Start here for" field stores.
export const START_ROLES = [
  { role: 'Students', label: 'Students and early career', short: 'Students', icon: '🎓', guide: 'students-and-early-career',
    blurb: 'No experience yet? Begin with the skills that matter and how the field fits together.' },
  { role: 'Clinicians', label: 'Clinicians and health workers', short: 'Clinicians', icon: '🩺', guide: 'clinicians-and-health-workers',
    blurb: 'Turn what you know about care into better tools, safer data and smarter decisions.' },
  { role: 'Tech', label: 'Tech people entering health', short: 'Tech', icon: '💻', guide: 'tech-people-entering-health',
    blurb: 'You know the tech. Learn the standards, the data and who controls it.' },
  { role: 'Policy', label: 'Policy and programme staff', short: 'Policy', icon: '📋', guide: 'policy-and-programme-staff',
    blurb: 'Strategy, financing and governance: what decides whether digital health lasts.' },
] as const;

export const PITCH_FORMATS = [
  { format: 'Article', checklist: ['Your argument in two or three sentences', 'Why it matters for health systems in Africa', 'Your name, role and a link to past work'] },
  { format: 'Interview', checklist: ['Who you want to interview and why', 'Three questions you would ask', 'Your name and role'] },
  { format: 'Case study', checklist: ['The setting, the problem and what changed', 'The evidence or data behind it', 'Who you worked with'] },
  { format: 'Explainer', checklist: ['The concept you want to explain', 'Who the explainer is for', 'One example you would use'] },
  { format: 'Series', checklist: ['The theme and the number of parts', 'Possible co-authors or guests', 'Your timeline'] },
] as const;

export const COUNTRIES = [
  'Africa (regional)', 'Global', 'Algeria', 'Angola', 'Benin', 'Botswana', 'Burkina Faso', 'Burundi', 'Cabo Verde',
  'Cameroon', 'Central African Republic', 'Chad', 'Comoros', 'Congo', "Côte d'Ivoire", 'DR Congo', 'Djibouti', 'Egypt',
  'Equatorial Guinea', 'Eritrea', 'Eswatini', 'Ethiopia', 'Gabon', 'Gambia', 'Ghana', 'Guinea', 'Guinea-Bissau', 'Kenya',
  'Lesotho', 'Liberia', 'Libya', 'Madagascar', 'Malawi', 'Mali', 'Mauritania', 'Mauritius', 'Morocco', 'Mozambique',
  'Namibia', 'Niger', 'Nigeria', 'Rwanda', 'São Tomé and Príncipe', 'Senegal', 'Seychelles', 'Sierra Leone', 'Somalia',
  'South Africa', 'South Sudan', 'Sudan', 'Tanzania', 'Togo', 'Tunisia', 'Uganda', 'Zambia', 'Zimbabwe',
] as const;

// Submission review stages, as in v6. The label is what contributors see.
export const STAGES = {
  new: { label: 'Received', tone: 'mute' },
  accepted: { label: 'Accepted, draft invited', tone: 'brand' },
  draft: { label: 'Draft received', tone: 'warn' },
  in_review: { label: 'In review', tone: 'warn' },
  changes: { label: 'Changes requested', tone: 'warn' },
  approved: { label: 'Approved', tone: 'ok' },
  published: { label: 'Published', tone: 'ok' },
  declined: { label: 'Declined', tone: 'crit' },
  added: { label: 'Added', tone: 'ok' },
} as const;
export type Stage = keyof typeof STAGES;

export const topicSlug = (t: string) => t.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Homepage blocks for the library and opportunities appear only from this many live items.
export const HOME_THRESHOLD = 5;
