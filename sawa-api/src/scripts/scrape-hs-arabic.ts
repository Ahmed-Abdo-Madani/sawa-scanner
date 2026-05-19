/**
 * Standalone script: Scrapes Arabic names & descriptions for HungerStation
 * products that already exist in the DB.
 *
 * Strategy:
 * 1. Query DB for all HungerStation products missing name_ar or description_ar.
 * 2. Convert each product's hs_product_url from sa-en → sa-ar locale.
 * 3. Navigate to the Arabic URL using Playwright (stealth mode).
 * 4. Extract Arabic name & description via:
 *    a) GraphQL response interception (product operations)
 *    b) RSC / __NEXT_DATA__ hydration sweep
 *    c) DOM fallback (h1 + description selector)
 * 5. Update the DB with extracted Arabic data.
 *
 * Usage:
 *   npx ts-node src/scripts/scrape-hs-arabic.ts [--limit=100] [--dry-run] [--concurrency=2] [--delay=3000]
 */

import { DataSource } from 'typeorm';
import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { BrowserContext, Page, Response } from 'playwright';
import * as dotenv from 'dotenv';

dotenv.config();

chromium.use(StealthPlugin());

// ─── Configuration ───────────────────────────────────────────────────────────

const HS_BASE_URL = 'https://hungerstation.com';
const HS_ALLOWED_GRAPHQL_HOST_SUFFIXES = [
  'hungerstation.com',
  'delivery-hero.io',
  'deliveryhero.io',
];

interface ArabicData {
  nameAr: string | null;
  descriptionAr: string | null;
}

// ─── CLI Argument Parsing ────────────────────────────────────────────────────

function parseArgs(): {
  limit: number;
  dryRun: boolean;
  concurrency: number;
  delay: number;
  overwrite: boolean;
} {
  const args = process.argv.slice(2);
  const opts = {
    limit: 500,
    dryRun: false,
    concurrency: 1,
    delay: 3000,
    overwrite: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--overwrite') opts.overwrite = true;
    else if (arg.startsWith('--limit='))
      opts.limit = parseInt(arg.split('=')[1], 10);
    else if (arg === '--limit' && i + 1 < args.length)
      opts.limit = parseInt(args[++i], 10);
    else if (arg.startsWith('--concurrency='))
      opts.concurrency = parseInt(arg.split('=')[1], 10);
    else if (arg === '--concurrency' && i + 1 < args.length)
      opts.concurrency = parseInt(args[++i], 10);
    else if (arg.startsWith('--delay='))
      opts.delay = parseInt(arg.split('=')[1], 10);
    else if (arg === '--delay' && i + 1 < args.length)
      opts.delay = parseInt(args[++i], 10);
  }

  return opts;
}

// ─── URL Locale Conversion ───────────────────────────────────────────────────

/**
 * Converts a HungerStation URL from English locale to Arabic locale.
 * /sa-en/... → /sa-ar/...
 */
function toArabicUrl(url: string): string {
  return url.replace('/sa-en/', '/sa-ar/');
}

// ─── GraphQL Interception ────────────────────────────────────────────────────

function interceptGraphQL(
  page: Page,
  operationPredicate: RegExp,
  sink: (json: any, operationName: string) => void,
): () => void {
  const handler = async (response: Response) => {
    try {
      const url = response.url();
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(url);
      } catch {
        return;
      }

      const host = parsedUrl.hostname.toLowerCase();
      const path = parsedUrl.pathname.toLowerCase();
      const contentType = (
        response.headers()['content-type'] || ''
      ).toLowerCase();

      const hostLooksExpected =
        HS_ALLOWED_GRAPHQL_HOST_SUFFIXES.some(
          (suffix) => host === suffix || host.endsWith(`.${suffix}`),
        );
      const pathLooksGraphApi =
        path.includes('graphql') || path.includes('/api/');
      const responseLooksJson = contentType.includes('application/json');

      const request = response.request();
      let operationName = '';
      let postDataParsed: any = null;
      try {
        postDataParsed = JSON.parse(request.postData() || '{}');
        operationName = postDataParsed.operationName || '';
      } catch {
        /* non-JSON body */
      }

      const postDataLooksGraphQl =
        !!postDataParsed &&
        typeof postDataParsed === 'object' &&
        typeof postDataParsed.operationName === 'string' &&
        (postDataParsed.query !== undefined ||
          postDataParsed.variables !== undefined);

      const shouldCapture =
        (pathLooksGraphApi && hostLooksExpected && responseLooksJson) ||
        (responseLooksJson && postDataLooksGraphQl && hostLooksExpected);

      if (!shouldCapture) return;
      if (!operationPredicate.test(operationName)) return;

      const json = await response.json();
      sink(json, operationName);
    } catch {
      /* swallow */
    }
  };

  page.on('response', handler);
  return () => page.off('response', handler);
}

// ─── Hydration Data Sweep ────────────────────────────────────────────────────

/**
 * Decodes RSC stream chunks embedded as self.__next_f.push([...]) in script tags.
 * Simplified version of the codebase's decodeRscStream.
 */
function decodeRscStreamFromText(text: string): any[] {
  const results: any[] = [];
  const re = /self\.__next_f\.push\(\s*\[(.*?)\]\s*\)/gs;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    try {
      const inner = match[1];
      // The push payload is [priority, stringChunk]
      const parsed = JSON.parse(`[${inner}]`);
      if (Array.isArray(parsed) && typeof parsed[1] === 'string') {
        const chunk = parsed[1];
        // Each line in the chunk may contain a JSON payload after the initial RSC header
        for (const line of chunk.split('\n')) {
          const jsonStart = line.indexOf('{');
          const jsonStartArr = line.indexOf('[');
          const start =
            jsonStart === -1
              ? jsonStartArr
              : jsonStartArr === -1
                ? jsonStart
                : Math.min(jsonStart, jsonStartArr);
          if (start === -1) continue;
          try {
            const json = JSON.parse(line.slice(start));
            results.push(json);
          } catch {
            /* not valid JSON */
          }
        }
      }
    } catch {
      /* skip */
    }
  }
  return results;
}

async function sweepHydrationData<T>(
  page: Page,
  extractor: (json: any) => T[],
): Promise<T[]> {
  const results: T[] = [];

  const scriptContents = await page.evaluate(() =>
    Array.from(document.querySelectorAll('script')).map((s) => ({
      id: s.id,
      type: s.getAttribute('type') || '',
      text: s.textContent || '',
    })),
  );

  for (const { id, type, text } of scriptContents) {
    if (!text) continue;

    // __NEXT_DATA__
    if (id === '__NEXT_DATA__' || text.includes('"pageProps"')) {
      try {
        const json = JSON.parse(text.trim());
        if (json) extractor(json).forEach((r) => results.push(r));
      } catch {
        /* malformed */
      }
    }

    // RSC stream self.__next_f.push(...)
    if (text.includes('self.__next_f.push')) {
      const jsons = decodeRscStreamFromText(text);
      for (const json of jsons) {
        extractor(json).forEach((r) => results.push(r));
      }
    }

    // Fallback: any JSON in the script block
    if (type === 'application/json' || type === 'application/ld+json') {
      try {
        const json = JSON.parse(text);
        extractor(json).forEach((r) => results.push(r));
      } catch {
        /* skip */
      }
    }
  }

  return results;
}

// ─── Product Node Extraction ─────────────────────────────────────────────────

function extractProductNodesFromJson(json: any): any[] {
  const out: any[] = [];
  const stack: any[] = [json];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== 'object') continue;
    if (Array.isArray(cur)) {
      for (const v of cur) stack.push(v);
      continue;
    }
    const looksLikeProduct =
      (cur.id || cur.productId || cur.menuItemId || cur.sku) &&
      (cur.name || cur.nameEn || cur.name_ar || cur.nameAr || cur.title) &&
      (cur.price !== undefined ||
        cur.pricing ||
        cur.prices ||
        cur.offerPrice !== undefined);
    if (looksLikeProduct) {
      out.push(cur);
      continue;
    }
    for (const v of Object.values(cur)) stack.push(v);
  }
  return out;
}

/**
 * Extracts Arabic name and description from a raw product node.
 * When visiting the Arabic locale, the `name` field itself should be in Arabic.
 */
function extractArabicFromRawNode(raw: any): ArabicData {
  // When on Arabic locale, the primary `name` field is Arabic
  const nameAr = String(
    raw.name || raw.nameAr || raw.name_ar || raw.title || '',
  ).trim();

  const descriptionAr = String(
    raw.description ||
      raw.descriptionAr ||
      raw.description_ar ||
      raw.shortDescription ||
      raw.shortDescriptionAr ||
      '',
  ).trim();

  return {
    nameAr: nameAr || null,
    descriptionAr: descriptionAr || null,
  };
}

// ─── Scrape Single Product (Arabic) ──────────────────────────────────────────

async function scrapeArabicData(
  context: BrowserContext,
  arabicUrl: string,
): Promise<ArabicData> {
  const page = await context.newPage();
  let bestResult: ArabicData = { nameAr: null, descriptionAr: null };

  try {
    const captured: ArabicData[] = [];

    // Intercept GraphQL for product data
    const teardown = interceptGraphQL(
      page,
      /MenuItem|Product|Item/i,
      (json) => {
        for (const raw of extractProductNodesFromJson(json)) {
          const data = extractArabicFromRawNode(raw);
          if (data.nameAr) captured.push(data);
        }
      },
    );

    // Navigate to Arabic product page
    await page.goto(arabicUrl, { waitUntil: 'commit', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Sweep hydration data
    const hydrated = await sweepHydrationData(page, (json) => {
      const out: ArabicData[] = [];
      for (const raw of extractProductNodesFromJson(json)) {
        const data = extractArabicFromRawNode(raw);
        if (data.nameAr) out.push(data);
      }
      return out;
    });
    captured.push(...hydrated);

    // DOM fallback
    const domData = await page.evaluate(() => {
      const h1 = document.querySelector('h1')?.textContent?.trim() || '';
      const desc =
        document
          .querySelector(
            '[class*="description"],[data-testid*="description"]',
          )
          ?.textContent?.trim() || '';
      return { nameAr: h1, descriptionAr: desc };
    });

    if (domData.nameAr) captured.push(domData);

    teardown();

    // Pick the best result: longest description wins
    for (const entry of captured) {
      if (!entry.nameAr) continue;
      // Check that the name actually contains Arabic characters
      if (!/[\u0600-\u06FF]/.test(entry.nameAr)) continue;

      const currentDescLen = bestResult.descriptionAr?.length || 0;
      const candidateDescLen = entry.descriptionAr?.length || 0;

      if (!bestResult.nameAr || candidateDescLen > currentDescLen) {
        bestResult = entry;
      }
    }

    return bestResult;
  } finally {
    await page.close().catch(() => undefined);
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs();

  console.log('═══════════════════════════════════════════════════════════');
  console.log('  🇸🇦  HungerStation Arabic Name & Description Scraper');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Limit:       ${opts.limit}`);
  console.log(`  Concurrency: ${opts.concurrency}`);
  console.log(`  Delay:       ${opts.delay}ms`);
  console.log(`  Dry Run:     ${opts.dryRun}`);
  console.log(`  Overwrite:   ${opts.overwrite}`);
  console.log('');

  // ── Connect to DB ──────────────────────────────────────────────────────
  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DATABASE_HOST,
    port: parseInt(process.env.DATABASE_PORT || '5432'),
    username: process.env.DATABASE_USERNAME,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
    ssl:
      process.env.DATABASE_SSL === 'true'
        ? { rejectUnauthorized: false }
        : false,
  });

  await dataSource.initialize();
  console.log('✅ Database connected.');

  // ── Query products needing Arabic data ─────────────────────────────────
  // Products from HungerStation with hs_product_url but missing Arabic fields
  let query = `
    SELECT id, name_en, name_ar, description_ar, hs_product_url, hs_product_id
    FROM product
    WHERE data_source = 'hungerstation'
      AND hs_product_url IS NOT NULL
      AND hs_product_url <> ''
  `;

  if (!opts.overwrite) {
    // Only products missing Arabic name OR description
    query += `
      AND (name_ar IS NULL OR name_ar = '' OR description_ar IS NULL OR description_ar = '')
    `;
  }

  query += `
    ORDER BY created_at DESC
    LIMIT $1
  `;

  const products: Array<{
    id: string;
    name_en: string;
    name_ar: string | null;
    description_ar: string | null;
    hs_product_url: string;
    hs_product_id: string | null;
  }> = await dataSource.query(query, [opts.limit]);

  console.log(
    `📦 Found ${products.length} products needing Arabic data.\n`,
  );

  if (products.length === 0) {
    console.log('🎉 All products already have Arabic data!');
    await dataSource.destroy();
    return;
  }

  // ── Launch Browser ─────────────────────────────────────────────────────
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    locale: 'ar-SA',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });

  // Block heavy resources
  await context.route('**/*', (route) => {
    const type = route.request().resourceType();
    const url = route.request().url();
    if (
      ['font', 'media', 'stylesheet', 'image'].includes(type) ||
      url.includes('google-analytics') ||
      url.includes('hotjar') ||
      url.includes('segment.com')
    ) {
      route.abort();
    } else {
      route.continue();
    }
  });

  console.log('🌐 Browser launched (Arabic locale).\n');

  // ── Process products ───────────────────────────────────────────────────
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  let noArabicFound = 0;
  const startTime = Date.now();

  for (let i = 0; i < products.length; i += opts.concurrency) {
    const batch = products.slice(i, i + opts.concurrency);

    const batchPromises = batch.map(async (product, batchIdx) => {
      const idx = i + batchIdx + 1;
      const arabicUrl = toArabicUrl(product.hs_product_url);

      console.log(
        `[${idx}/${products.length}] 🔍 ${product.name_en || product.hs_product_id}`,
      );
      console.log(`  📎 ${arabicUrl}`);

      try {
        const arabicData = await scrapeArabicData(context, arabicUrl);

        if (!arabicData.nameAr) {
          console.log(`  ⚠️  No Arabic data found.`);
          noArabicFound++;
          return;
        }

        const needsNameUpdate =
          opts.overwrite || !product.name_ar || product.name_ar === '';
        const needsDescUpdate =
          opts.overwrite ||
          !product.description_ar ||
          product.description_ar === '';

        if (!needsNameUpdate && !needsDescUpdate) {
          console.log(`  ⏭️  Already populated, skipping.`);
          skipped++;
          return;
        }

        const updateFields: string[] = [];
        const updateValues: any[] = [];
        let paramIdx = 1;

        if (needsNameUpdate && arabicData.nameAr) {
          updateFields.push(`name_ar = $${paramIdx++}`);
          updateValues.push(arabicData.nameAr);
        }
        if (needsDescUpdate && arabicData.descriptionAr) {
          updateFields.push(`description_ar = $${paramIdx++}`);
          updateValues.push(arabicData.descriptionAr);
        }

        if (updateFields.length === 0) {
          console.log(`  ⏭️  No new data to update.`);
          skipped++;
          return;
        }

        updateValues.push(product.id);

        if (opts.dryRun) {
          console.log(
            `  🏷️  [DRY RUN] Would set name_ar="${arabicData.nameAr}", description_ar="${(arabicData.descriptionAr || '').substring(0, 60)}..."`,
          );
          updated++;
        } else {
          await dataSource.query(
            `UPDATE product SET ${updateFields.join(', ')}, updated_at = NOW() WHERE id = $${paramIdx}`,
            updateValues,
          );
          console.log(
            `  ✅ Updated: name_ar="${arabicData.nameAr}", desc=${arabicData.descriptionAr ? `"${arabicData.descriptionAr.substring(0, 60)}..."` : 'null'}`,
          );
          updated++;
        }
      } catch (err: any) {
        console.log(`  ❌ Error: ${err.message}`);
        failed++;
      }
    });

    await Promise.all(batchPromises);

    // Throttle between batches
    if (i + opts.concurrency < products.length) {
      const jitter = opts.delay + Math.random() * 1000;
      await new Promise((resolve) => setTimeout(resolve, jitter));
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  📊  Summary');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Total processed: ${products.length}`);
  console.log(`  ✅ Updated:      ${updated}`);
  console.log(`  ⏭️  Skipped:      ${skipped}`);
  console.log(`  ⚠️  No Arabic:    ${noArabicFound}`);
  console.log(`  ❌ Failed:       ${failed}`);
  console.log(`  ⏱️  Duration:     ${elapsed}s`);
  console.log('═══════════════════════════════════════════════════════════');

  await browser.close();
  await dataSource.destroy();
  console.log('\n✅ Done.');
}

main().catch((err) => {
  console.error('❌ Fatal error:', err.message);
  process.exit(1);
});
