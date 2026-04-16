import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

chromium.use(StealthPlugin());

async function inspectNinjaGql() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true
  });
  const page = await context.newPage();

  console.log('Intercepting GQL for Ninja Product Detail...');
  
  page.on('response', async response => {
    const url = response.url();
    if (url.includes('graphql.ananinja.com')) {
      try {
        const json = await response.json();
        const body = JSON.stringify(json);
        if (body.includes('productId') || body.includes('gtin') || body.includes('price')) {
           const request = response.request();
           const postData = JSON.parse(request.postData() || '{}');
           console.log(`[GQL HIT] Operation: ${postData.operationName}`);
        }
      } catch (e) {}
    }
  });

  try {
    // Navigating to a product detail page
    await page.goto('https://ananinja.com/sa/en/product/carewavy1-1free-14823', { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(5000);
  } catch (err) {
    console.error(`Navigation error: ${err.message}`);
  } finally {
    await browser.close();
  }
}

inspectNinjaGql();
