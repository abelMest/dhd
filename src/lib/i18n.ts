// French interface text for the reader's English/French switch (button in the masthead).
// Editions are written in English; in French mode readers see each edition's "En bref" summary and the
// site's interface in French. Both languages are in the page; CSS shows one (html.fr), so switching is instant.

export const TOPIC_FR: Record<string, string> = {
  'Systems & interoperability': 'Systèmes et interopérabilité',
  'AI & data': 'IA et données',
  'Policy & financing': 'Politiques et financement',
  'Public health': 'Santé publique',
  'Health workforce': 'Personnels de santé',
  'Supply chain & logistics': 'Chaîne d’approvisionnement et logistique',
};
export const topicFr = (t: string) => TOPIC_FR[t] || t;

export const NAV_FR: Record<string, string> = {
  '/start/': 'Commencer ici', '/editions/': 'Éditions', '/library/': 'Bibliothèque',
  '/opportunities/': 'Opportunités', '/contribute/': 'Contribuer', '/about/': 'À propos', '/': 'Accueil',
};

/** 20 juillet 2026 (or juil. 2026 with { month: 'short', year: 'numeric' }). */
export function fmtDateFr(iso: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' }) {
  if (!iso) return '';
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('fr-FR', { ...opts, timeZone: 'UTC' });
}
