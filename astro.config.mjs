// @ts-check
import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';
import sitemap from '@astrojs/sitemap';

// SITE_URL is set in the Cloudflare Pages build settings once the domain is live.
export default defineConfig({
  site: process.env.SITE_URL || 'https://digitalhealthdigest.africa',
  trailingSlash: 'always',
  integrations: [
    preact(),
    sitemap({ filter: (page) => !page.includes('/console/') }),
  ],
  build: { format: 'directory', inlineStylesheets: 'always' },
});
