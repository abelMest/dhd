# Digital Health Digest: website

The Digest's home on its own domain: every edition in full, the library, the opportunity board, contributor submissions and an editor console. It replaces the v6 claude.ai page, whose files stay in `../digital-health-digest-v6/` as a rollback.

- **Astro** builds plain, fast HTML pages. Public pages make no database calls.
- **Supabase** holds the content, sign-in (email links, no passwords) and photos.
- **Cloudflare Pages** hosts it. **Publish site** in the console rebuilds it in about two minutes.
- **Pagefind** gives full-text search with no server.

## Run it on your computer

Needs Node 22.12 or newer.

```bash
npm install
npm run build
npm run preview
```

Open http://localhost:4321. With no `.env`, the site builds from `data/seed.json` (the v6 content, plus the full text of all 20 editions from Substack). Contribute and the console say they need the database.

`npm run dev` gives live reload while you change the design. Search only works after `npm run build`.

## Tests

```bash
npm run build
npx playwright test
node --test tests/
```

`tests/e2e` checks every public page on desktop and phone. `tests/db.test.mjs` runs the real database migration in an in-memory Postgres and checks the access rules: readers can't see drafts or editor notes, contributors see only their own submissions and can't approve themselves, and only editors change roles.

## Going live: one-time setup

You need three free accounts. The steps are in order.

### 1. Supabase (database and sign-in)

1. Create a project at supabase.com. Pick the Europe (Frankfurt) or South Africa region, whichever is closer to most readers.
2. In **SQL editor**, paste and run `supabase/migrations/20261019000000_init.sql`.
3. In **Authentication → URL configuration**, set the Site URL to `https://digitalhealthdigest.africa` and add `http://localhost:4321/**` to the redirect URLs.
4. Copy `.env.example` to `.env`. From **Project settings → API**, fill in the URL, the anon key and the service-role key.
5. Load the v6 content and the Substack text:

   ```bash
   node --env-file=.env scripts/import-v6.mjs
   node --env-file=.env scripts/import-substack.mjs
   ```

### 2. Make yourself an editor

Sign in once at `/console/` (or `/contribute/`) to create your account. Then, in the Supabase SQL editor:

```sql
update public.profiles set role = 'editor'
where user_id = (select id from auth.users where email = 'you@example.org');
```

### 3. Cloudflare Pages (hosting)

1. Put this folder in a GitHub repository (private is fine).
2. In Cloudflare: **Workers & Pages → Create → Pages → Connect to Git**, then pick the repository.
   - Build command: `npm run build`. Output directory: `dist`.
   - Environment variables: `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`, `SITE_URL`, and `NODE_VERSION` = `22`.
3. **Settings → Builds → Deploy hooks**: create one called "console" and copy its URL.
4. **Custom domains**: add `digitalhealthdigest.africa` once you have registered it (registered at Namecheap; nameservers point to Cloudflare).

### 4. The Publish button and the nightly job

```bash
npx supabase login
npx supabase link --project-ref YOUR-PROJECT-REF
npx supabase secrets set DEPLOY_HOOK_URL=https://api.cloudflare.com/...  SITE_ORIGIN=https://digitalhealthdigest.africa
npx supabase functions deploy publish
```

In GitHub, open **Settings → Secrets and variables → Actions** and add `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `DEPLOY_HOOK_URL`. Every night at 05:30 Addis Ababa time, `.github/workflows/nightly.yml` then:

- imports new Substack posts as **draft** editions;
- rebuilds the site, so closed opportunities drop off.

## Everyday editing

| You want to | Do this |
|---|---|
| Publish a new edition | Post it on Substack as usual. The next morning it's a draft in **Console → Editions**: add topic, author and En bref, set it to published, then press **Publish site**. |
| Fix a typo | Console → Editions → the edition → edit → Save → Publish site. |
| Review a pitch | Console → Submissions. Accept, request changes or decline, and add a note. The contributor sees it on /contribute. |
| Add a resource or opportunity | Console → Library / Opportunities → New. Opportunities need a "last checked" date before they can go live. |
| Change homepage or About text | Console → Settings & site text. Clearing a box restores the default. |

## Design and motion

The design is built from the logo: brand blue `#298FC9`, heavy uppercase League Spartan for display, and the heartbeat line that runs on. ECG graph paper is the background texture, and Newsreader is the reading face. `public/brand/logo-original.webp` is the source artwork. `src/components/Logo.astro` is the same logo as live SVG.

- **Motion** (`src/scripts/motion.ts`, GSAP, about 29 KB) loads only when the browser is idle. It never loads for people who ask for reduced motion, on data-saver, or on 2G. Content is always visible without it.
- **Page transitions** use the browser's own View Transitions: an edition's title morphs from its card into the page headline, with no script.
- Brand blue is reserved for graphics and large type, because it's too light for small text on white. Small blue text uses `--blue-ink`.

## Where things are

```
src/pages/             one file per page (editions/[id].astro is the edition page)
src/layouts/Base.astro masthead, footer and the head tags for SEO and sharing
src/styles/global.css  the whole design system (colours, type, spacing, light and dark)
src/lib/data.ts        reads Supabase at build time, or the seed when not configured
src/lib/copy.ts        default site text (from v6)
src/lib/taxonomy.ts    topics, resource types, opportunity kinds, countries
src/islands/           the interactive parts: Contribute.tsx and console/
supabase/              database schema and access rules, and the publish function
scripts/               v6 import and Substack import
```

## Known limits

- Edition images still load from Substack's image service. That works and is fast, but if Substack ever removes a post, its images go with it.
- Search covers editions. The library and opportunities have their own filters on their pages.
- Older editions that only exist on LinkedIn need pasting into the console by hand. The archive shows how many are still missing ("Showing 20 of 63").
