import axios from 'axios';
import { chromium } from 'playwright-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';

// @ts-ignore
chromium.use(stealthPlugin());

function parseSallaJsonLd(html: string): any[] {
  const results: any[] = [];
  const matches = html.match(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/gi);
  if (!matches) return results;

  for (const match of matches) {
    try {
      const jsonText = match
        .replace(/<script\s+type="application\/ld\+json">/i, '')
        .replace(/<\/script>/i, '')
        .trim();
      const json = JSON.parse(jsonText);
      const items = Array.isArray(json) ? json : [json];

      for (const obj of items) {
        if (obj['@type'] === 'ItemList' && Array.isArray(obj.itemListElement)) {
          for (const el of obj.itemListElement) {
            const product = el.item;
            if (product && product.name && product.url) {
              results.push({
                name: product.name,
                url: product.url,
                image: product.image,
              });
            }
          }
        }
        if (obj['@type'] === 'Product' && obj.name && obj.url) {
          results.push({
            name: obj.name,
            url: obj.url,
            image: obj.image,
          });
        }
      }
    } catch { /* ignore */ }
  }
  return results;
}

async function testCategory() {
  const catUrl = 'https://yasminstore.com/en/food-cabinet/c988350339';
  console.log(`🌐 Testing category page via Axios: ${catUrl}`);
  try {
    const res = await axios.get(catUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Referer': 'https://yasminstore.com',
      },
      timeout: 10000,
    });
    console.log(`✅ Axios Success. Status: ${res.status}. HTML Length: ${res.data.length}`);
    const parsed = parseSallaJsonLd(res.data);
    console.log(`📦 Found ${parsed.length} products via JSON-LD on Axios:`);
    console.log(parsed.slice(0, 5));
  } catch (e: any) {
    console.log(`❌ Axios Failed: ${e.message}`);
  }

  console.log('\n🌐 Testing category page via Playwright...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(catUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    const html = await page.content();
    console.log(`✅ Playwright Success. HTML Length: ${html.length}`);
    const parsed = parseSallaJsonLd(html);
    console.log(`📦 Found ${parsed.length} products via JSON-LD on Playwright:`);
    console.log(parsed.slice(0, 5));

    // Also get product links from DOM
    const domProducts = await page.evaluate(() => {
      const cards = document.querySelectorAll('custom-salla-product-card, salla-product-card');
      return Array.from(cards).map((c: any) => {
        const link = c.querySelector('a')?.href || c.href || '';
        const titleEl = c.querySelector('h1, h2, h3, h4, h5, .title, .name');
        const name = titleEl?.textContent?.trim() || '';
        return { name, url: link };
      });
    });
    console.log(`📦 Found ${domProducts.length} products via DOM on Playwright:`);
    console.log(domProducts.slice(0, 5));

    // Check pagination link
    const nextButton = await page.evaluate(() => {
      const nextEl = document.querySelector('a[rel="next"], .pagination__next, [class*="pagination"] a:last-child');
      return nextEl ? (nextEl as HTMLAnchorElement).href : null;
    });
    console.log(`Pagination next: ${nextButton}`);

  } catch (e: any) {
    console.log(`❌ Playwright Failed: ${e.message}`);
  } finally {
    await browser.close();
  }
}

testCategory();
