import { chromium } from 'playwright-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';

// @ts-ignore
chromium.use(stealthPlugin());

async function checkArabicLocale() {
  const arabicUrl = 'https://yasminstore.com/ar/-/c988350339';
  console.log(`🌐 Opening Arabic page: ${arabicUrl}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(arabicUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const domProducts = await page.evaluate(() => {
      const cards = document.querySelectorAll('custom-salla-product-card, salla-product-card');
      return Array.from(cards).map((c: any) => {
        const link = c.querySelector('a')?.href || c.href || '';
        const titleEl = c.querySelector('h1, h2, h3, h4, h5, .title, .name');
        const name = titleEl?.textContent?.trim() || '';
        return { name, url: link };
      });
    });

    console.log(`📦 Found ${domProducts.length} products on Arabic page:`);
    console.log(JSON.stringify(domProducts.slice(0, 5), null, 2));

  } catch (err: any) {
    console.error(`❌ Error: ${err.message}`);
  } finally {
    await browser.close();
  }
}

checkArabicLocale();
