// What the console edits. Field names are the database column names, so rows save as they are.
import { TOPICS, RESOURCE_TYPES, AUDIENCES, OPP_KINDS, COUNTRIES, START_ROLES } from '../../lib/taxonomy';
import type { FieldDef, Values } from '../ui';

export type TableName = 'articles' | 'authors' | 'resources' | 'opportunities';

export interface Collection {
  table: TableName;
  label: string;
  singular: string;
  order: { column: string; ascending: boolean };
  fields: FieldDef[];
  /** Line shown in the list under the title. */
  summary: (r: Values) => string;
  /** Status pill in the list. */
  state?: (r: Values) => { label: string; tone: string } | null;
  defaults: () => Values;
  /** Extra checks before save; return messages to show. */
  validate?: (r: Values) => string[];
}

const today = () => new Date().toISOString().slice(0, 10);
const daysFrom = (iso: string) => Math.round((Date.parse(iso) - Date.parse(today())) / 86400000);
const COUNTRY_OPTIONS = COUNTRIES as readonly string[];

export const slugify = (s: string) =>
  s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

export const COLLECTIONS: Record<TableName, Collection> = {
  articles: {
    table: 'articles', label: 'Editions', singular: 'edition',
    order: { column: 'published_at', ascending: false },
    fields: [
      { name: 'title', label: 'Title', required: true },
      { name: 'id', label: 'Web address', required: true, hint: 'Lowercase words and hyphens, e.g. why-pilots-fail. Changing it later breaks shared links.' },
      { name: 'dek', label: 'Standfirst', type: 'textarea', rows: 2, hint: 'One or two sentences under the title. Also used in search results and share previews.' },
      { name: 'fr', label: 'En bref (French one-liner)', type: 'textarea', rows: 2 },
      { name: 'topic', label: 'Topic', type: 'select', options: TOPICS, required: true },
      { name: 'authors', label: 'Authors', type: 'multi', options: [] },
      { name: 'published_at', label: 'Publication date', type: 'date', required: true },
      { name: 'status', label: 'Status', type: 'select', options: ['draft', 'published'], required: true },
      { name: 'body_md', label: 'Full text (Markdown)', type: 'markdown', rows: 18, hint: '## for headings, **bold**, *italic*, [link text](https://…), > for quotes, - for lists.' },
      { name: 'substack_url', label: 'Substack link', type: 'url' },
      { name: 'linkedin_url', label: 'LinkedIn link', type: 'url' },
      { name: 'pinned', label: 'Essential read (homepage, up to three)', type: 'checkbox' },
      { name: 'featured', label: 'Featured', type: 'checkbox' },
      { name: 'start_for', label: 'Start here for', type: 'multi', options: START_ROLES.map((r) => r.role) },
    ],
    summary: (r) => [r.published_at, r.topic || 'No topic yet'].filter(Boolean).join(' · '),
    state: (r) => (r.status === 'published' ? { label: 'Published', tone: 'ok' } : { label: 'Draft', tone: 'warn' }),
    defaults: () => ({ status: 'draft', published_at: today(), start_for: [], authors: [] }),
    validate: (r) => [
      ...(!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(String(r.id || '')) ? ['The web address may only use lowercase letters, numbers and single hyphens.'] : []),
      ...(r.status === 'published' && !(r.authors as string[])?.length ? ['Add at least one author before publishing.'] : []),
    ],
  },
  authors: {
    table: 'authors', label: 'Authors', singular: 'author',
    order: { column: 'name', ascending: true },
    fields: [
      { name: 'name', label: 'Name', required: true },
      { name: 'id', label: 'Short id', required: true, hint: 'Used in the web address, e.g. abel. Cannot change once the author has editions.' },
      { name: 'role', label: 'Role' },
      { name: 'org', label: 'Organisation' },
      { name: 'country', label: 'Country', type: 'select', options: COUNTRY_OPTIONS },
      { name: 'photo_path', label: 'Photo', type: 'photo', hint: 'Cropped to a square from the centre. Shown on their author page, bylines and About.' },
      { name: 'bio', label: 'Bio', type: 'textarea', rows: 3 },
      { name: 'linkedin_url', label: 'LinkedIn profile', type: 'url' },
      { name: 'substack_url', label: 'Substack profile', type: 'url' },
      { name: 'is_editor', label: 'Editor of the Digest', type: 'checkbox' },
    ],
    summary: (r) => [r.role, r.org].filter(Boolean).join(' · ') || 'No role yet',
    state: (r) => (!r.bio ? { label: 'No bio', tone: 'warn' } : null),
    defaults: () => ({}),
  },
  resources: {
    table: 'resources', label: 'Library', singular: 'resource',
    order: { column: 'added_at', ascending: false },
    fields: [
      { name: 'title', label: 'Title', required: true },
      { name: 'url', label: 'Link', type: 'url', required: true },
      { name: 'summary', label: 'Summary', type: 'textarea', rows: 3 },
      { name: 'publisher', label: 'Publisher' },
      { name: 'year', label: 'Year' },
      { name: 'topic', label: 'Topic', type: 'select', options: TOPICS },
      { name: 'type', label: 'Type', type: 'select', options: RESOURCE_TYPES },
      { name: 'countries', label: 'Countries', type: 'multi', options: COUNTRY_OPTIONS },
      { name: 'audience', label: 'Audience', type: 'multi', options: AUDIENCES },
      { name: 'status', label: 'Status', type: 'select', options: ['pending', 'published'], required: true },
    ],
    summary: (r) => [r.type, r.publisher].filter(Boolean).join(' · '),
    state: (r) => (r.status === 'published' ? { label: 'Live', tone: 'ok' } : { label: 'Pending', tone: 'warn' }),
    defaults: () => ({ status: 'published', countries: [], audience: [] }),
  },
  opportunities: {
    table: 'opportunities', label: 'Opportunities', singular: 'opportunity',
    order: { column: 'deadline', ascending: true },
    fields: [
      { name: 'title', label: 'Title', required: true },
      { name: 'url', label: 'Link to the official call', type: 'url', required: true },
      { name: 'org', label: 'Organisation' },
      { name: 'kind', label: 'Type', type: 'select', options: OPP_KINDS },
      { name: 'deadline', label: 'Deadline', type: 'date', hint: 'Leave empty for rolling calls.' },
      { name: 'eligibility', label: 'Who can apply', type: 'textarea', rows: 2 },
      { name: 'countries', label: 'Countries', type: 'multi', options: COUNTRY_OPTIONS },
      { name: 'verified_at', label: 'Last checked against the source', type: 'date' },
      { name: 'notes', label: 'Editor notes (never shown publicly)', type: 'textarea', rows: 2 },
      { name: 'status', label: 'Status', type: 'select', options: ['pending', 'published'], required: true },
    ],
    summary: (r) => [r.org, r.deadline ? `Deadline ${r.deadline}` : 'Rolling'].filter(Boolean).join(' · '),
    state: (r) => {
      if (r.deadline && String(r.deadline) < today()) return { label: 'Closed', tone: 'crit' };
      if (r.status !== 'published') return { label: 'Pending', tone: 'warn' };
      if (!r.verified_at || daysFrom(String(r.verified_at)) < -30) return { label: 'Re-check', tone: 'warn' };
      if (r.deadline && daysFrom(String(r.deadline)) <= 14) return { label: 'Closing soon', tone: 'warn' };
      return { label: 'Live', tone: 'ok' };
    },
    defaults: () => ({ status: 'pending', countries: [] }),
    validate: (r) => (r.status === 'published' && !r.verified_at ? ['Check the listing against its source and set the date before publishing.'] : []),
  },
};

/** Columns that live in other tables and must not be sent with the row. */
export const VIRTUAL: Partial<Record<TableName, string[]>> = { articles: ['authors'], opportunities: ['notes'] };
