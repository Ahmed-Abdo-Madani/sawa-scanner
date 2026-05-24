const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();
  try {
    const url = 'https://waw.sa/product/19740';
    console.log(`Visiting WAW product page: ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(4000);

    const info = await page.evaluate(() => {
      // Dump title
      const title = document.querySelector('h1, [class*="product-title"], [class*="title"]')?.innerText?.trim() || '';
      
      // Dump price
      const price = document.querySelector('.price, [class*="price"]')?.innerText?.trim() || '';
      
      // Dump image
      const img = document.querySelector('.product-image img, .image img, img[class*="product"]')?.src || '';
      
      // Let's dump all text to see if there is any barcode/SKU
      const bodyText = document.body.innerText;
      const barcodeMatch = bodyText.match(/\b\d{8,14}\b/g) || [];
      
      return {
        title,
        price,
        img,
        barcodeMatch,
        htmlSnippet: document.querySelector('.product-details, #content, .main-content')?.outerHTML?.substring(0, 1000) || document.body.innerHTML.substring(0, 1000)
      };
    });

    console.log('=== WAW PRODUCT DETAILS ===');
    console.log(info);
  } catch (e) {
    console.log(`Error: ${e.message}`);
  } finally {
    await page.close();
  }

  await browser.close();
}
run();
