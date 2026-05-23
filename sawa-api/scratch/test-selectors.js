const { chromium } = require('playwright');

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const searchUrl = 'https://store.shonaksa.com/search?q=8906131952855';
  await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  
  const selectors = ['salla-empty-state', '.empty-page', '.no-results', '.empty-state'];
  for (const sel of selectors) {
    const el = await page.$(sel);
    console.log(`Selector "${sel}" exists?`, el !== null);
    if (el) {
      console.log(`Is visible?`, await el.isVisible());
    }
  }
  await browser.close();
}

run().catch(console.error);
