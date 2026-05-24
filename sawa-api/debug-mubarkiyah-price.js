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
    
    const productHtml = await page.evaluate(() => {
      // Find anchor containing /item/ which is how products are linked
      const anchor = document.querySelector('a[href*="/item/"]');
      if (!anchor) return 'Anchor not found';
      
      // Let's grab the card container (parent or grand-parent)
      let container = anchor;
      while (container && container.tagName !== 'BODY') {
        if (container.className.includes('style_card') || container.className.includes('style_itemsContainer') || container.className.includes('style_itemsSection')) {
          break;
        }
        container = container.parentElement;
      }
      return container ? container.outerHTML : anchor.outerHTML;
    });
    
    console.log('=== MUBARKIYAH PRODUCT HTML ===');
    console.log(productHtml.substring(0, 1500));
  } catch (e) {
    console.log(`Error: ${e.message}`);
  } finally {
    await page.close();
  }

  await browser.close();
}
run();
