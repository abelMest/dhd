import { test, expect, type Page } from '@playwright/test';

// Collect page errors on every test, and fail if any appear.
let errors: string[];
test.beforeEach(({ page }) => {
  errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
});
test.afterEach(() => expect(errors, 'JavaScript errors on the page').toEqual([]));

const noSideScroll = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

test('home shows the lead edition, essential reads and start here', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Digital Health Digest/);
  await expect(page.locator('.lead h2')).toHaveCount(1);
  await expect(page.locator('.essentials li')).toHaveCount(3);
  expect(await page.locator('.grid3 .card').count()).toBeGreaterThanOrEqual(6);
  await expect(page.locator('.vital')).toHaveCount(6);
  // Start here tabs switch panels.
  await page.getByRole('tab', { name: 'Developers' }).click();
  await expect(page.locator('#sp-2')).toBeVisible();
  await expect(page.locator('#sp-0')).toBeHidden();
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
  await page.goto('/editions/');
  await expect(page.locator('.pageHead .lede')).toContainText('Showing 20 of 63 editions');
  await expect(page.locator('.row[data-topic]:visible')).toHaveCount(20);
  await page.locator('#topicChips .chip', { hasText: 'AI & data' }).click();
  const n = await page.locator('.row[data-topic]:visible').count();
  expect(n).toBeGreaterThan(0);
  expect(n).toBeLessThan(20);
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
  const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent())!);
  expect(ld['@type']).toBe('NewsArticle');
  expect(ld.author[0].name).toBe('Abel Mestie Mekonnen');
  const og = await page.request.get('/og/why-pilots-fail.png');
  expect(og.headers()['content-type']).toContain('image/png');
  await noSideScroll(page);
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
  await page.goto('/editions/');
  await page.locator('#eq').fill('fhir');
  const shown = await page.locator('.row[data-topic]:visible').count();
  expect(shown).toBeGreaterThan(0);
  expect(shown).toBeLessThan(20);
  await expect(page.locator('#count')).toContainText(`${shown} of 20`);
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
  expect((rss.match(/<item>/g) || []).length).toBe(20);
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
