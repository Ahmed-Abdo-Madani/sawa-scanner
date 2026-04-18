import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

chromium.use(StealthPlugin());

async function debugGql() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 14_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Mobile/15E148 Safari/604.1',
  });

  const page = await context.newPage();

  page.on('request', (request) => {
    if (request.url().includes('graphql')) {
      console.log(`\n[GQL REQ] ${request.postData()}`);
    }
  });

  page.on('response', async (response) => {
    if (response.url().includes('graphql')) {
      try {
        const json = await response.json();
        console.log(
          `[GQL RES] Operations: ${Object.keys(json.data || {}).join(', ')}`,
        );
        // If it looks like products, dump partial JSON
        const productsKey = Object.keys(json.data || {}).find(
          (k) =>
            k.toLowerCase().includes('product') ||
            k.toLowerCase().includes('item') ||
            k.toLowerCase().includes('catalog'),
        );
        if (productsKey) {
          console.log(
            `[GQL DATA] Found likely products in key: ${productsKey}`,
          );
          console.log(JSON.stringify(json.data[productsKey]).substring(0, 500));
        }
      } catch (e) {}
    }
  });

  const url = 'https://ananinja.com/sa/en/category/water-t-5';
  console.log(`Navigating to ${url}...`);
  await page.goto(url, { waitUntil: 'networkidle' });

  console.log('Scrolling...');
  await page.evaluate(async () => {
    window.scrollBy(0, 2000);
  });
  await page.waitForTimeout(5000);

  await browser.close();
}

debugGql().catch(console.error);
