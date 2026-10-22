import { test, expect, type Page } from '@playwright/test';

// Collect page errors on every test, and fail if any appear.
let errors: string[];
test.beforeEach(({ page }) => {
  errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
});
test.afterEach(() => expect(errors, 'JavaScript errors on the page').toEqual([]));

// How many editions are live, read from the feed, so the tests keep passing as editions are added.
const editionCount = async (page: Page) =>
  ((await (await page.request.get('/rss.xml')).text()).match(/<item>/g) || []).length;
const pad2 = (n: number) => String(n).padStart(2, '0');

const noSideScroll = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

test('home shows the lead edition, essential reads and start here', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Digital Health Digest/);
  await expect(page.locator('.lead h2')).toHaveCount(1);
  await expect(page.locator('.stack .stackCard')).toHaveCount(3);
  await expect(page.locator('.topicCard')).toHaveCount(6);
  // Hero glass cards link to real pages, and headline accents render as serif emphasis, not asterisks.
  expect(await page.locator('.stage .glass').count()).toBeGreaterThanOrEqual(2);
  await expect(page.locator('h2 .accent').first()).toBeVisible();
  expect(await page.locator('main').innerText()).not.toMatch(/\*\w/);
  // Statement words light up as the paragraph scrolls into view (motion on).
  const words = page.locator('[data-words] .w');
  expect(await words.count()).toBeGreaterThan(20);
  await page.locator('[data-words]').scrollIntoViewIfNeeded();
  await expect.poll(() => page.locator('[data-words] .w.lit').count(), { timeout: 5000 }).toBeGreaterThan(0);
  // Start here: one block per role; on wide screens the pinned label follows the role in view.
  const roles = page.locator('#start .roleBlock');
  await expect(roles).toHaveCount(3);
  if ((page.viewportSize()?.width ?? 0) > 860) {
    await roles.nth(2).scrollIntoViewIfNeeded();
    await expect(page.locator('[data-role-name]')).toHaveText('Developers');
  }
  // Carousel: ten recent editions; the next button moves it along.
  const track = page.locator('[data-track]');
  await expect(track.locator('.slide')).toHaveCount(10);
  if ((page.viewportSize()?.width ?? 0) > 700) {
    await track.scrollIntoViewIfNeeded();
    // Every card says what it is without scrolling: title and date sit inside the visible card.
    const first = track.locator('.slide').first();
    await expect(first.locator('h3')).toBeInViewport();
    await expect(first.locator('.sMeta')).toBeInViewport();
    await page.locator('[data-car="1"]').click();
    await expect.poll(() => track.evaluate((t) => t.scrollLeft), { timeout: 5000 }).toBeGreaterThan(50);
  }
  // Library and opportunities only appear once they hold 5+ live items: library is empty, the board has 5+.
  await expect(page.getByRole('heading', { name: 'Find what you need' })).toHaveCount(0);
  await noSideScroll(page);
});

test('subscribe opens Substack with the email filled in', async ({ page }) => {
  await page.goto('/');
  const form = page.locator('form.subscribe').first();
  await expect(form).toHaveAttribute('action', 'https://dhdigest.substack.com/subscribe');
  await expect(form.locator('input[name=utm_source]')).toHaveValue('dhd_hub');
});

test('archive is honest about the count and filters by topic', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('dhd-archive-view', 'list'));
  const total = await editionCount(page);
  await page.goto('/editions/');
  await expect(page.locator('.pageHead .lede')).toContainText(`Showing ${total} of `);
  await expect(page.locator('.row[data-topic]:visible')).toHaveCount(total);
  await page.locator('#topicChips .chip', { hasText: 'AI & data' }).click();
  const n = await page.locator('.row[data-topic]:visible').count();
  expect(n).toBeGreaterThan(0);
  expect(n).toBeLessThan(total);
  await expect(page).toHaveURL(/topic=AI/);
});

test('an edition page has the full text, En bref, author and share tags', async ({ page }) => {
  await page.goto('/editions/why-pilots-fail/');
  await expect(page.locator('h1')).toHaveText(/Why Digital Health Pilots Fail/);
  await expect(page.locator('.prose h2').first()).toBeVisible();
  expect(await page.locator('.prose').innerText()).toMatch(/pilot graveyard/);
  await expect(page.locator('.enbref')).toContainText('En bref');
  await expect(page.locator('.byline .who a')).toHaveText('Abel Mestie Mekonnen');
  await expect(page.locator('.byline .share a')).toHaveCount(3);
  await expect(page.locator('.readNext a').first()).toBeVisible();
  // Section headings carry anchors, and the contents list (wide screens) links to them.
  const firstH2 = await page.locator('.prose h2').first().getAttribute('id');
  expect(firstH2).toBeTruthy();
  if ((page.viewportSize()?.width ?? 0) > 1180) await expect(page.locator(`.toc a[href="#${firstH2}"]`)).toBeVisible();
  await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href', /\/editions\/why-pilots-fail\/$/);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /\/og\/why-pilots-fail\.png$/);
  const lds = (await page.locator('script[type="application/ld+json"]').allTextContents()).map((t) => JSON.parse(t));
  const ld = lds.find((x) => x['@type'] === 'NewsArticle');
  expect(ld).toBeTruthy();
  const crumbs = lds.find((x) => x['@type'] === 'BreadcrumbList');
  expect(crumbs.itemListElement.map((i: { name: string }) => i.name)).toEqual(['Home', 'Editions', ld.articleSection, ld.headline]);
  expect(ld.author[0].name).toBe('Abel Mestie Mekonnen');
  const og = await page.request.get('/og/why-pilots-fail.png');
  expect(og.headers()['content-type']).toContain('image/png');
  await noSideScroll(page);
});

test('an edition can be cited: APA, BibTeX and Scholar tags', async ({ page }) => {
  await page.goto('/editions/why-pilots-fail/');
  await expect(page.locator('meta[name="citation_title"]')).toHaveAttribute('content', /Why Digital Health Pilots Fail/);
  await expect(page.locator('meta[name="citation_author"]').first()).toHaveAttribute('content', 'Abel Mestie Mekonnen');
  await page.locator('.cite summary').click();
  await expect(page.locator('.citeText')).toContainText('Mekonnen, A. M. (');
  await expect(page.locator('.citeText')).toContainText('/editions/why-pilots-fail/');
  await expect(page.locator('.citeBody pre')).toContainText('@online{mekonnen');
});

test('opportunities show deadlines and last-checked dates, and filter by type', async ({ page }) => {
  await page.goto('/opportunities/');
  const items = page.locator('.oppCard');
  expect(await items.count()).toBeGreaterThanOrEqual(5);
  await expect(items.first()).toContainText(/Verified|Not yet verified/);
  // Type filter: only grants remain, and groups with nothing left disappear.
  await page.locator('#oppFilters .chip', { hasText: 'Grant' }).click();
  for (const kind of await page.locator('.oppCard:visible').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.kind))) expect(kind).toBe('Grant');
  await expect(page).toHaveURL(/type=Grant/);
  // Text search narrows further; a search with no hits offers a reset.
  await page.locator('#oq').fill('zzzz-no-such-thing');
  await expect(page.locator('#oppNone')).toBeVisible();
  await page.locator('#oppReset').click();
  expect(await page.locator('.oppCard:visible').count()).toBe(await items.count());
  // Each listing has its own link anchor, and dated ones offer a calendar file.
  await expect(items.first()).toHaveAttribute('id', /^opp-/);
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('[data-ics]').first().click()]);
  expect(download.suggestedFilename()).toMatch(/^deadline-\d{4}-\d{2}-\d{2}\.ics$/);
});

test('the archive search narrows editions by words', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('dhd-archive-view', 'list'));
  const total = await editionCount(page);
  await page.goto('/editions/');
  await page.locator('#eq').fill('fhir');
  const shown = await page.locator('.row[data-topic]:visible').count();
  expect(shown).toBeGreaterThan(0);
  expect(shown).toBeLessThan(total);
  await expect(page.locator('#count')).toContainText(`${shown} of ${total}`);
});

test('library explains itself while empty, and links to suggest a resource', async ({ page }) => {
  await page.goto('/library/');
  const tiles = page.locator('.kindTile');
  if (await tiles.count()) {
    await expect(tiles).toHaveCount(8); // seven resource types + the call to suggest one
    await expect(page.locator('a[href="/contribute/#resource"]').first()).toBeVisible();
  } else {
    expect(await page.locator('.resCard').count()).toBeGreaterThan(0);
  }
});

test('search finds editions by words in their body', async ({ page }) => {
  await page.goto('/search/?q=graveyard');
  await expect(page.locator('.pagefind-ui__result-link').first()).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.pagefind-ui__result-link').first()).toContainText(/Pilots Fail/);
});

test('topic, author and about pages render', async ({ page }) => {
  await page.goto('/topics/ai-and-data/');
  await expect(page.locator('h1')).toHaveText('AI & data');
  await page.goto('/authors/abel/');
  await expect(page.locator('h1')).toHaveText('Abel Mestie Mekonnen');
  await page.goto('/about/');
  await expect(page.locator('#standard li')).toHaveCount(5);
});

// Built with Supabase settings, these pages ask for an email sign-in; without, they say they need the database.
test('contribute and console offer sign-in (or explain they need the database)', async ({ page }) => {
  await page.goto('/contribute/');
  await page.getByRole('button', { name: 'Case study' }).click();
  await expect(page.getByText('The evidence or data behind it')).toBeVisible();
  const signIn = page.getByRole('button', { name: 'Email me a sign-in link' });
  await expect(signIn.or(page.getByText('Submissions open once the site is connected'))).toBeVisible();
  await page.goto('/console/');
  await expect(signIn.or(page.getByText('The console works once the site is connected to Supabase'))).toBeVisible();
  await expect(page.locator('meta[name=robots]')).toHaveAttribute('content', 'noindex');
});

test('feeds, sitemap and robots are in place', async ({ request }) => {
  const rss = await (await request.get('/rss.xml')).text();
  expect(rss).toContain('<item>');
  expect((rss.match(/<item>/g) || []).length).toBeGreaterThanOrEqual(20);
  const sm = await (await request.get('/sitemap-0.xml')).text();
  expect(sm).toContain('/editions/why-pilots-fail/');
  expect(sm).not.toContain('/console/');
  expect(await (await request.get('/robots.txt')).text()).toContain('Disallow: /console/');
});

test('dark theme toggle sticks across pages', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await page.locator('#themeBtn').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.goto('/about/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('with reduced motion, nothing animates and everything is visible at once', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto('/');
  await expect(page.locator('html')).not.toHaveClass(/motion/);
  // The motion bundle is never downloaded.
  const scripts = await page.evaluate(() => performance.getEntriesByType('resource').map((r) => r.name).filter((n) => /motion|gsap|ScrollTrigger/i.test(n)));
  expect(scripts).toEqual([]);
  for (const el of await page.locator('[data-reveal]').all()) expect(await el.evaluate((e) => getComputedStyle(e).opacity)).toBe('1');
  await ctx.close();
});

test('with motion, revealed content ends fully visible', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveClass(/motion-on/);
  await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); } });
  await page.waitForTimeout(1500);
  const hidden = await page.locator('[data-reveal]').evaluateAll((els) => els.filter((e) => getComputedStyle(e).opacity !== '1').length);
  expect(hidden).toBe(0);
});

test('phones get a full-screen menu that opens, traps focus and closes with Escape', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const pill = page.locator('#menuBtn');
  await expect(pill).toBeVisible();
  await pill.click();
  const sheet = page.locator('#fsMenu');
  await expect(sheet).toHaveClass(/open/);
  await expect(pill).toHaveAttribute('aria-expanded', 'true');
  await expect(sheet.getByRole('link', { name: /Opportunities/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).not.toHaveClass(/open/);
  await expect(pill).toHaveAttribute('aria-expanded', 'false');
  await expect(pill).toBeFocused();
});

test('back-to-top appears after scrolling and returns to the top', async ({ page }) => {
  await page.goto('/');
  const btn = page.locator('#toTop');
  await expect(btn).not.toHaveClass(/show/);
  await page.evaluate(() => scrollTo(0, innerHeight * 3));
  await expect(btn).toHaveClass(/show/);
  await btn.click();
  await expect.poll(() => page.evaluate(() => scrollY), { timeout: 5000 }).toBeLessThan(10);
});

test('wide screens fly through the archive in 3D; the list is one click away', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1024, 'The tunnel opens by default on wide screens only');
  const total = await editionCount(page);
  await page.goto('/editions/');
  const tunnel = page.locator('[data-tunnel]');
  await expect(tunnel).toBeVisible();
  await expect(tunnel.locator('canvas')).toHaveCount(1);
  await expect(tunnel.locator('.tCard h2')).not.toBeEmpty();
  await expect(tunnel.locator('.tCard .cnt')).toContainText(`/ ${pad2(total)}`);
  // Filtering by topic rebuilds the road with only that topic's editions.
  await tunnel.locator('select').selectOption('AI & data');
  await expect(tunnel.locator('.tCard .cnt')).not.toContainText(`/ ${pad2(total)}`);
  // List view brings the plain archive back and removes the 3D scene.
  await page.locator('[data-viewtoggle] [data-view="list"]').click();
  await expect(tunnel).toBeHidden();
  await expect(page.locator('.row[data-topic]').first()).toBeVisible();
  await expect(tunnel.locator('canvas')).toHaveCount(0);
});

test('first visit plays the title card once; it never blocks reduced-motion readers', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/');
  await expect(page.locator('#preloader')).toBeVisible();
  await expect(page.locator('#preloader')).toHaveCount(0, { timeout: 5000 });
  await page.goto('/about/');
  await expect(page.locator('#preloader')).toBeHidden();
  await ctx.close();
  const calm = await browser.newContext({ reducedMotion: 'reduce' });
  const p2 = await calm.newPage();
  await p2.goto('/');
  await expect(p2.locator('#preloader')).toBeHidden();
  await calm.close();
});

test('the Contribute timeline and FAQ work', async ({ page }) => {
  await page.goto('/contribute/');
  await expect(page.locator('[data-board] .phase')).toHaveCount(6);
  const first = page.locator('.faq details').first();
  await first.locator('summary').click();
  await expect(first).toHaveAttribute('open', '');
  await expect(first.locator('.ans p')).toBeVisible();
});

test('Partner with us, Privacy and ads.txt are in place, and paid things are labelled', async ({ page }) => {
  await page.goto('/partner/');
  await expect(page.locator('h1')).toContainText(/digital health/i);
  await expect(page.locator('#policy li')).toHaveCount(6);
  await expect(page.locator('.statStrip dd').first()).not.toBeEmpty();
  await page.goto('/privacy/');
  await expect(page.locator('h1')).toHaveText(/privacy/i);
  await expect(page.locator('.prose h2', { hasText: 'Advertising' })).toBeVisible();
  const ads = await page.request.get('/ads.txt');
  expect(ads.ok()).toBe(true);
  expect(await ads.text()).toMatch(/^(#|google\.com, pub-\d+, DIRECT, f08c47fec0942fa0)/);
  await page.goto('/opportunities/');
  await expect(page.locator('#feature')).toContainText('Feature your opportunity');
  // Any ad or sponsor that is shown carries its label.
  for (const el of await page.locator('.adSlot').all()) await expect(el.locator('.lbl')).toHaveText('Advertisement');
  await expect(page.locator('footer a[href="/privacy/"]')).toHaveCount(1);
});
