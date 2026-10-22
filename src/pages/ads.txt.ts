// ads.txt: tells ad buyers which ad accounts may sell space on this site (Google checks it for AdSense).
import { loadSite } from '../lib/data';

export async function GET() {
  const { settings } = await loadSite();
  const client = settings.revenue.adsense.client;           // ca-pub-1234567890123456
  const body = client
    ? `google.com, ${client.replace(/^ca-/, '')}, DIRECT, f08c47fec0942fa0\n`
    : '# No advertising accounts yet.\n';
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
