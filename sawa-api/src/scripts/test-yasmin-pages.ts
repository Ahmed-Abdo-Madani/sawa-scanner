import { chromium } from 'playwright-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';

// @ts-ignore
chromium.use(stealthPlugin());

async function testYasminPages() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  const getProducts = async (url: string) => {
    const page = await context.newPage();
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);
      const products = await page.evaluate(() => {
        const cards = document.querySelectorAll('custom-salla-product-card, salla-product-card');
        return Array.from(cards).map((c: any) => {
          const link = c.querySelector('a')?.href || c.href || '';
          const titleEl = c.querySelector('h1, h2, h3, h4, h5, .title, .name');
          const name = titleEl?.textContent?.trim() || '';
          
          // Try to extract price
          const priceEl = c.querySelector('.s-product-card-price, .main-price, [class*="price"]');
          const priceText = priceEl?.textContent?.trim() || '';
          
          // Try to extract image
          const imgEl = c.querySelector('img');
          const image = imgEl?.src || imgEl?.getAttribute('data-src') || imgEl?.getAttribute('lazy-src') || null;

          // Check if out of stock
          const outOfStock = c.textContent?.includes('نفدت الكمية') || c.textContent?.includes('Out of stock') || false;

          return { name, url: link, priceText, image, inStock: !outOfStock };
        });
      });
      return products;
    } finally {
      await page.close();
    }
  };

  try {
    const page1Url = 'https://yasminstore.com/ar/-/c988350339?page=1';
    const page2Url = 'https://yasminstore.com/ar/-/c988350339?page=2';

    console.log(`Loading Page 1: ${page1Url}`);
    const products1 = await getProducts(page1Url);
    console.log(`Page 1 count: ${products1.length}`);
    console.log('Page 1 first 2 products:', products1.slice(0, 2));

    console.log(`Loading Page 2: ${page2Url}`);
    const products2 = await getProducts(page2Url);
    console.log(`Page 2 count: ${products2.length}`);
    console.log('Page 2 first 2 products:', products2.slice(0, 2));

  } catch (err: any) {
    console.error(`❌ Error: ${err.message}`);
  } finally {
    await browser.close();
  }
}

testYasminPages();
