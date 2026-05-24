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
    await page.goto('https://www.atayib.com/en/search?q=milk', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(4000);
    
    const productHtml = await page.evaluate(() => {
      const art = document.querySelector('article.art');
      return art ? art.outerHTML : 'Not found';
    });
    
    console.log('=== ATAYIB PRODUCT HTML ===');
    console.log(productHtml);
  } catch (e) {
    console.log(`Error: ${e.message}`);
  } finally {
    await page.close();
  }

  await browser.close();
}
run();
