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
    await page.goto('https://mubarkiyah.com/search?q=%D8%AD%D9%84%D9%8A%D8%A8', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(4000);
    
    const cardInfo = await page.evaluate(() => {
      const container = document.querySelector('[class*="horizontalCartContainer"]');
      if (!container) return 'Container not found';
      return {
        text: container.innerText,
        html: container.outerHTML
      };
    });
    
    console.log('=== MUBARKIYAH CARD INNER TEXT ===');
    console.log(cardInfo.text);
    console.log('=== MUBARKIYAH CARD HTML ===');
    console.log(cardInfo.html);
  } catch (e) {
    console.log(`Error: ${e.message}`);
  } finally {
    await page.close();
  }

  await browser.close();
}
run();
