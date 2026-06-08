import { chromium } from 'playwright-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';

// @ts-ignore
chromium.use(stealthPlugin());

async function listCategories() {
  const homeUrl = 'https://yasminstore.com/ar';
  console.log(`🌐 Fetching categories from: ${homeUrl}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(homeUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const categories = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('a'));
      const results: { name: string; url: string; id: string }[] = [];
      const seenIds = new Set<string>();

      for (const a of anchors) {
        const href = a.href || '';
        const match = href.match(/\/c(\d+)$/);
        if (match) {
          const id = match[1];
          if (!seenIds.has(id)) {
            seenIds.add(id);
            const name = a.textContent?.trim() || '';
            // Make sure the URL is absolute and starts with the home domain
            let cleanUrl = href;
            if (!cleanUrl.startsWith('http')) {
              cleanUrl = `${window.location.origin}${cleanUrl}`;
            }
            results.push({ name, url: cleanUrl, id });
          }
        }
      }
      return results;
    });

    console.log(`📂 Found ${categories.length} unique categories:`);
    console.log(JSON.stringify(categories, null, 2));

  } catch (err: any) {
    console.error(`❌ Error: ${err.message}`);
  } finally {
    await browser.close();
  }
}

listCategories();
