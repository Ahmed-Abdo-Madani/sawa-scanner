/**
 * Debug script: Navigate to a HungerStation store category page and
 * dump subcategory DOM structure + GraphQL payloads to understand
 * how subcategories are rendered.
 */
import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as fs from 'fs';
import * as path from 'path';

chromium.use(StealthPlugin());

const HS_BASE_URL = 'https://hungerstation.com';

// Al Othaim Yasmin store URL
const STORE_URL =
  'https://hungerstation.com/sa-en/qc/65969/AL-Othaim/branch/fa269bef-9ae0-4877-ace8-272d61be145d~142939';

async function main() {
  console.log('🚀 Launching Chromium (stealth mode)...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    locale: 'en-SA',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });

  // Block images/fonts/media for speed
  await context.route('**/*', (route) => {
    const type = route.request().resourceType();
    const url = route.request().url();
    if (
      ['font', 'media', 'stylesheet', 'image'].includes(type) ||
      url.includes('google-analytics') ||
      url.includes('hotjar')
    ) {
      route.abort();
    } else {
      route.continue();
    }
  });

  const page = await context.newPage();

  // ── STEP 1: Navigate to store page and discover categories ──
  console.log(`\n📡 Step 1: Navigating to store page: ${STORE_URL}`);
  const gqlCategories: any[] = [];
  const gqlProducts: any[] = [];

  page.on('response', async (response) => {
    const url = response.url();
    const contentType = response.headers()['content-type'] || '';
    if (!contentType.includes('application/json')) return;
    if (!url.includes('graphql') && !url.includes('/api/')) return;

    try {
      const json = await response.json();
      const text = JSON.stringify(json);
      if (/categor/i.test(text.slice(0, 5000))) {
        gqlCategories.push({ url: url.slice(0, 120), payload: json });
      }
      if (/subcategor|childCategor|tabs|children/i.test(text.slice(0, 5000))) {
        console.log(`  🟢 Subcategory-shaped GQL response from: ${url.slice(0, 100)}`);
        gqlProducts.push({ url: url.slice(0, 120), payload: json });
      }
    } catch (_) {}
  });

  await page.goto(STORE_URL, { waitUntil: 'commit', timeout: 30000 });
  await page.waitForTimeout(3000);

  const title = await page.title();
  console.log(`  📄 Title: ${title}`);
  if (/just a moment/i.test(title)) {
    console.error('  ❌ Cloudflare challenge detected! Cannot proceed.');
    await browser.close();
    process.exit(1);
  }

  // Scroll to load all categories
  await page.evaluate(async () => {
    for (let i = 0; i < 15; i++) {
      window.scrollBy(0, 400);
      await new Promise((r) => setTimeout(r, 200));
    }
  });
  await page.waitForTimeout(2000);

  // Discover category links in DOM
  const categoryLinks = await page.evaluate(() => {
    const anchors = Array.from(
      document.querySelectorAll<HTMLAnchorElement>(
        'a[href*="/category/"], a[href*="/cat/"], [data-testid*="category"] a, [class*="category"] a',
      ),
    );
    return anchors
      .map((a) => ({
        href: a.getAttribute('href') || a.href || '',
        text: a.textContent?.trim() || '',
        classes: a.className,
      }))
      .filter(
        (x) => x.text && x.href && (x.href.includes('/category/') || x.href.includes('/cat/')),
      );
  });

  console.log(`\n📂 Discovered ${categoryLinks.length} top-level category links:`);
  for (const cat of categoryLinks.slice(0, 30)) {
    console.log(`  - "${cat.text}" → ${cat.href}`);
  }

  // Pick a category to inspect (try "Cold Drinks" or first available)
  const coldDrinks = categoryLinks.find(
    (c) => /cold.*drink|مشروبات.*بارد/i.test(c.text),
  );
  const targetCategory = coldDrinks || categoryLinks[0];

  if (!targetCategory) {
    console.error('❌ No category links found in DOM!');

    // Dump all anchor elements for debugging
    const allAnchors = await page.evaluate(() => {
      return Array.from(document.querySelectorAll<HTMLAnchorElement>('a'))
        .map((a) => ({
          href: a.getAttribute('href') || '',
          text: a.textContent?.trim()?.slice(0, 60) || '',
        }))
        .filter((x) => x.href && x.text)
        .slice(0, 50);
    });
    console.log(`\nAll anchors (first 50):`);
    allAnchors.forEach((a) => console.log(`  "${a.text}" → ${a.href}`));

    // Save HTML for manual inspection
    const html = await page.content();
    const outPath = path.join(process.cwd(), 'hs-store-debug.html');
    fs.writeFileSync(outPath, html);
    console.log(`\n💾 Full HTML saved to: ${outPath}`);

    await browser.close();
    return;
  }

  console.log(`\n🎯 Target category: "${targetCategory.text}" → ${targetCategory.href}`);

  // ── STEP 2: Navigate to the category page and look for subcategories ──
  const categoryUrl = new URL(targetCategory.href, HS_BASE_URL).toString();
  console.log(`\n📡 Step 2: Navigating to category page: ${categoryUrl}`);

  const page2 = await context.newPage();
  const subcatGqlPayloads: any[] = [];

  page2.on('response', async (response) => {
    const url = response.url();
    const contentType = response.headers()['content-type'] || '';
    if (!contentType.includes('application/json')) return;

    try {
      const request = response.request();
      let opName = '';
      try {
        opName = JSON.parse(request.postData() || '{}').operationName || '';
      } catch (_) {}

      const json = await response.json();
      subcatGqlPayloads.push({ url: url.slice(0, 120), opName, payload: json });
    } catch (_) {}
  });

  await page2.goto(categoryUrl, { waitUntil: 'commit', timeout: 30000 });
  await page2.waitForTimeout(3000);

  // Scroll the page
  await page2.evaluate(async () => {
    for (let i = 0; i < 10; i++) {
      window.scrollBy(0, 400);
      await new Promise((r) => setTimeout(r, 200));
    }
  });
  await page2.waitForTimeout(2000);

  // ── ANALYSIS 1: Look for subcategory DOM elements ──
  console.log('\n🔍 Analysis 1: Subcategory DOM elements...');

  const subcatDom = await page2.evaluate(() => {
    const results: {
      type: string;
      tag: string;
      text: string;
      href: string;
      classes: string;
      parent: string;
      testId: string;
    }[] = [];

    // Pattern 1: Horizontal scrollable containers with links/buttons
    const scrollContainers = document.querySelectorAll(
      '[class*="scroll"], [class*="slider"], [class*="swiper"], [class*="carousel"], [class*="chip"], [class*="tab"], [class*="filter"], [class*="pill"]',
    );
    for (const container of scrollContainers) {
      const children = container.querySelectorAll('a, button, [role="tab"], [role="option"]');
      for (const child of children) {
        const el = child as HTMLElement;
        results.push({
          type: 'scroll-child',
          tag: el.tagName.toLowerCase(),
          text: el.textContent?.trim()?.slice(0, 80) || '',
          href: el.getAttribute('href') || '',
          classes: el.className?.slice?.(0, 120) || '',
          parent: container.className?.slice?.(0, 120) || '',
          testId: el.getAttribute('data-testid') || '',
        });
      }
    }

    // Pattern 2: Links containing /category/ or /subcategory/ or /cat/
    const catLinks = document.querySelectorAll<HTMLAnchorElement>(
      'a[href*="/category/"], a[href*="/subcategory/"], a[href*="/sub-category/"], a[href*="/cat/"]',
    );
    for (const a of catLinks) {
      results.push({
        type: 'category-link',
        tag: 'a',
        text: a.textContent?.trim()?.slice(0, 80) || '',
        href: a.getAttribute('href') || '',
        classes: a.className?.slice?.(0, 120) || '',
        parent: a.parentElement?.className?.slice?.(0, 120) || '',
        testId: a.getAttribute('data-testid') || '',
      });
    }

    // Pattern 3: Tab-like elements (role="tab", role="tablist")
    const tabs = document.querySelectorAll('[role="tab"], [role="tablist"] > *');
    for (const tab of tabs) {
      const el = tab as HTMLElement;
      results.push({
        type: 'tab',
        tag: el.tagName.toLowerCase(),
        text: el.textContent?.trim()?.slice(0, 80) || '',
        href: (el as HTMLAnchorElement).getAttribute?.('href') || '',
        classes: el.className?.slice?.(0, 120) || '',
        parent: el.parentElement?.className?.slice?.(0, 120) || '',
        testId: el.getAttribute('data-testid') || '',
      });
    }

    // Pattern 4: data-testid containing subcategory/filter/chip
    const testIdEls = document.querySelectorAll(
      '[data-testid*="subcategory"], [data-testid*="sub-category"], [data-testid*="filter"], [data-testid*="chip"], [data-testid*="tab"]',
    );
    for (const el of testIdEls) {
      const htmlEl = el as HTMLElement;
      results.push({
        type: 'testid-match',
        tag: htmlEl.tagName.toLowerCase(),
        text: htmlEl.textContent?.trim()?.slice(0, 80) || '',
        href: (htmlEl as HTMLAnchorElement).getAttribute?.('href') || '',
        classes: htmlEl.className?.slice?.(0, 120) || '',
        parent: htmlEl.parentElement?.className?.slice?.(0, 120) || '',
        testId: htmlEl.getAttribute('data-testid') || '',
      });
    }

    // Pattern 5: All anchors on the page (to find any subcategory links)
    const allAnchors = document.querySelectorAll<HTMLAnchorElement>('a');
    for (const a of allAnchors) {
      const text = a.textContent?.trim() || '';
      const href = a.getAttribute('href') || '';
      // Only include anchors that look like they could be subcategories
      if (
        text.length > 2 &&
        text.length < 40 &&
        href &&
        !href.startsWith('#') &&
        !href.includes('/items/') &&
        !href.includes('/product/') &&
        (href.includes('/category/') || href.includes('/cat/'))
      ) {
        results.push({
          type: 'any-cat-anchor',
          tag: 'a',
          text: text.slice(0, 80),
          href,
          classes: a.className?.slice?.(0, 120) || '',
          parent: a.parentElement?.className?.slice?.(0, 120) || '',
          testId: a.getAttribute('data-testid') || '',
        });
      }
    }

    return results;
  });

  // Deduplicate
  const seen = new Set<string>();
  const uniqueSubcats = subcatDom.filter((s) => {
    const key = `${s.text}|${s.href}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`  Found ${uniqueSubcats.length} potential subcategory elements:`);
  for (const s of uniqueSubcats) {
    console.log(
      `  [${s.type}] <${s.tag}> "${s.text}" href="${s.href}" testid="${s.testId}"`,
    );
    if (s.classes) console.log(`    classes: ${s.classes}`);
    if (s.parent) console.log(`    parent: ${s.parent}`);
  }

  // ── ANALYSIS 2: Product links on this page (to see how many we get) ──
  const productLinks = await page2.evaluate(() => {
    const links = document.querySelectorAll<HTMLAnchorElement>(
      'a[href*="/items/"], a[href*="/item/"], a[href*="/product/"]',
    );
    return Array.from(links)
      .map((a) => ({
        href: a.getAttribute('href') || '',
        text:
          a.querySelector('h1,h2,h3,[class*="name"],[class*="title"]')
            ?.textContent?.trim() ||
          a.textContent?.trim()?.slice(0, 60) ||
          '',
      }))
      .filter((x) => x.text && x.href);
  });

  console.log(`\n📦 Product links visible on category page: ${productLinks.length}`);
  for (const p of productLinks.slice(0, 10)) {
    console.log(`  - "${p.text}" → ${p.href.slice(0, 80)}`);
  }
  if (productLinks.length > 10) {
    console.log(`  ... and ${productLinks.length - 10} more`);
  }

  // ── ANALYSIS 3: GQL payloads from category page ──
  console.log(`\n🔌 GraphQL responses from category page: ${subcatGqlPayloads.length}`);
  for (const gql of subcatGqlPayloads) {
    const payloadStr = JSON.stringify(gql.payload);
    const hasSubcats =
      /subcategor|childCategor|children|tabs/i.test(payloadStr.slice(0, 3000));
    const hasCats = /categor/i.test(payloadStr.slice(0, 3000));
    console.log(
      `  [${gql.opName || 'unknown'}] ${gql.url} (${payloadStr.length} bytes) cats=${hasCats} subcats=${hasSubcats}`,
    );

    // Deep search for subcategory arrays in GraphQL payloads
    const findSubcategoryArrays = (obj: any, keyPath: string[] = []): any[] => {
      const results: any[] = [];
      if (!obj || typeof obj !== 'object') return results;
      if (Array.isArray(obj)) {
        obj.forEach((item) => results.push(...findSubcategoryArrays(item, keyPath)));
        return results;
      }
      for (const [k, v] of Object.entries(obj)) {
        if (
          /subcategor|childCategor|children|tabs|categoryChildren/i.test(k) &&
          Array.isArray(v)
        ) {
          results.push({ path: [...keyPath, k].join('.'), items: v });
        }
        results.push(...findSubcategoryArrays(v, [...keyPath, k]));
      }
      return results;
    };

    const subcatArrays = findSubcategoryArrays(gql.payload);
    if (subcatArrays.length > 0) {
      console.log(`  ✅ Found subcategory arrays in GraphQL response:`);
      for (const arr of subcatArrays) {
        console.log(`    path: ${arr.path} (${arr.items.length} items)`);
        for (const item of arr.items.slice(0, 5)) {
          console.log(
            `      - id=${item.id || item.slug || '?'} name="${item.name || item.nameEn || item.title || '?'}" url=${item.url || item.link || item.href || '?'}`,
          );
        }
      }
    }
  }

  // ── ANALYSIS 4: Hydration data (RSC / __NEXT_DATA__) ──
  console.log('\n📦 Analysis 4: Hydration data...');
  const scriptData = await page2.evaluate(() => {
    const scripts = Array.from(document.querySelectorAll('script'));
    return scripts.map((s) => ({
      id: s.id,
      type: s.getAttribute('type') || '',
      text: s.textContent || '',
    }));
  });

  for (const { id, text } of scriptData) {
    if (!text) continue;
    // Look for subcategory data in RSC stream
    if (text.includes('self.__next_f.push')) {
      // Extract JSON chunks from RSC stream
      const jsonMatches = text.match(/\[[\d,]+,"([^"]*?)"\]/g);
      if (jsonMatches) {
        for (const match of jsonMatches) {
          try {
            const arr = JSON.parse(match);
            const content = arr[arr.length - 1];
            if (typeof content === 'string' && /subcategor|childCategor/i.test(content.slice(0, 2000))) {
              console.log(`  🟢 RSC chunk with subcategory data (${content.length} chars)`);
              console.log(`    Preview: ${content.slice(0, 300)}`);
            }
          } catch (_) {}
        }
      }
    }

    if (id === '__NEXT_DATA__') {
      try {
        const json = JSON.parse(text);
        const findCats = (obj: any, depth = 0): void => {
          if (depth > 8 || !obj || typeof obj !== 'object') return;
          if (Array.isArray(obj)) {
            obj.forEach((item) => findCats(item, depth + 1));
            return;
          }
          for (const [k, v] of Object.entries(obj)) {
            if (/subcategor|childCategor|children|tabs/i.test(k) && Array.isArray(v)) {
              console.log(`  🟢 __NEXT_DATA__ path "${k}" has ${(v as any[]).length} items`);
              for (const item of (v as any[]).slice(0, 3)) {
                console.log(`    - ${JSON.stringify(item).slice(0, 200)}`);
              }
            }
            findCats(v, depth + 1);
          }
        };
        findCats(json);
      } catch (_) {}
    }
  }

  // ── Save full HTML for manual inspection ──
  const html = await page2.content();
  const outPath = path.join(process.cwd(), 'hs-category-debug.html');
  fs.writeFileSync(outPath, html);
  console.log(`\n💾 Category page HTML saved to: ${outPath}`);

  // Also save GQL payloads
  const gqlOutPath = path.join(process.cwd(), 'hs-category-gql.json');
  fs.writeFileSync(
    gqlOutPath,
    JSON.stringify(subcatGqlPayloads, null, 2).slice(0, 500000),
  );
  console.log(`💾 GQL payloads saved to: ${gqlOutPath}`);

  await browser.close();
  console.log('\n✅ Debug complete.');
}

main().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
