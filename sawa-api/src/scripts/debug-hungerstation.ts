/**
 * Diagnostic script: dumps what hungerstation.com/sa-en/qc/supermarkets
 * actually renders so we can identify the correct city data extraction path.
 */
import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const HS_BASE_URL = 'https://hungerstation.com';
const HS_SUPERMARKETS_INDEX = '/sa-en/qc/supermarkets';

async function main() {
  console.log('🚀 Launching Chromium...');
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
    ],
  });

  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    locale: 'en-SA',
    viewport: { width: 390, height: 844 },
  });

  const page = await context.newPage();

  // ── Capture all network responses ──
  const networkLog: { url: string; status: number; contentType: string }[] = [];
  const gqlPayloads: { url: string; payload: any }[] = [];

  page.on('response', async (response) => {
    const url = response.url();
    const contentType = response.headers()['content-type'] || '';
    networkLog.push({ url, status: response.status(), contentType });

    if (contentType.includes('application/json') && (url.includes('graphql') || url.includes('/api/'))) {
      try {
        const json = await response.json();
        gqlPayloads.push({ url, payload: json });
      } catch (_) {}
    }
  });

  const targetUrl = HS_BASE_URL + HS_SUPERMARKETS_INDEX;
  console.log(`📡 Navigating to: ${targetUrl}`);
  await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  // ── Dump page title and URL ──
  console.log(`\n📄 Final URL: ${page.url()}`);
  console.log(`📌 Title: ${await page.title()}`);

  // ── Dump all city links found in DOM ──
  const cityLinks = await page.evaluate(({ base, index }: { base: string; index: string }) => {
    const anchors = Array.from(
      document.querySelectorAll<HTMLAnchorElement>(
        `a[href*="supermarkets/"], a[href*="/qc/supermarkets"]`,
      ),
    );
    return anchors.map((a) => ({
      href: a.getAttribute('href'),
      text: a.textContent?.trim(),
    }));
  }, { base: HS_BASE_URL, index: HS_SUPERMARKETS_INDEX });

  console.log(`\n🏙  City links in DOM (${cityLinks.length}):`);
  cityLinks.slice(0, 20).forEach((l) => console.log(`  ${l.text} -> ${l.href}`));

  // ── Dump script tags (check for __NEXT_DATA__) ──
  const scriptSummary = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('script')).map((s) => ({
      id: s.id,
      type: s.getAttribute('type') || '',
      preview: (s.textContent || '').slice(0, 200),
    }));
  });

  const nextDataScript = scriptSummary.find((s) => s.id === '__NEXT_DATA__');
  if (nextDataScript) {
    console.log('\n📦 __NEXT_DATA__ found! Preview:');
    console.log(nextDataScript.preview);
  } else {
    console.log('\n⚠️  __NEXT_DATA__ NOT found in page scripts.');
  }

  // Dump RSC indicators
  const rscScripts = scriptSummary.filter((s) => s.preview.includes('self.__next_f.push'));
  console.log(`\n🔄 RSC (next_f) script blocks: ${rscScripts.length}`);

  // ── Check for city/location data in __NEXT_DATA__ ──
  const nextDataText = await page.evaluate(() => {
    const el = document.getElementById('__NEXT_DATA__');
    return el?.textContent?.slice(0, 2000) || '';
  });

  if (nextDataText) {
    try {
      const json = JSON.parse(nextDataText);
      // Search for city-like keys
      const cityKeys = ['cities', 'locations', 'areas', 'regions'];
      const cityData: Record<string, any> = {};
      const recurse = (obj: any, depth = 0) => {
        if (depth > 6 || !obj || typeof obj !== 'object') return;
        for (const [k, v] of Object.entries(obj)) {
          if (cityKeys.some((key) => k.toLowerCase().includes(key))) {
            cityData[k] = Array.isArray(v) ? `Array(${(v as any[]).length})` : v;
          }
          recurse(v, depth + 1);
        }
      };
      recurse(json);
      console.log('\n🗺  City-related keys in __NEXT_DATA__:', JSON.stringify(cityData, null, 2));
    } catch (_) {
      console.log('\n⚠️  Could not parse __NEXT_DATA__ JSON');
    }
  }

  // ── Dump GraphQL payloads ──
  console.log(`\n🔌 GraphQL/API responses captured: ${gqlPayloads.length}`);
  gqlPayloads.slice(0, 5).forEach(({ url, payload }) => {
    console.log(`\n  URL: ${url}`);
    console.log(`  Payload preview: ${JSON.stringify(payload).slice(0, 300)}`);
  });

  // ── Network log summary ──
  const apiCalls = networkLog.filter(
    (n) =>
      n.contentType.includes('application/json') ||
      n.url.includes('graphql') ||
      n.url.includes('/api/'),
  );
  console.log(`\n📊 Total API/JSON requests: ${apiCalls.length}`);
  apiCalls.slice(0, 15).forEach((n) => console.log(`  [${n.status}] ${n.url.slice(0, 120)}`));

  // ── Save full HTML for manual inspection ──
  const html = await page.content();
  const outPath = path.join(process.cwd(), 'hs-supermarkets-debug.html');
  fs.writeFileSync(outPath, html);
  console.log(`\n💾 Full HTML saved to: ${outPath}`);

  await browser.close();
  console.log('\n✅ Done.');
}

main().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
