const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

const stores = [
  { name: 'atayib', url: 'https://www.atayib.com/search?q=%D8%AD%D9%84%D9%8A%D8%A8' },
  { name: 'mubarkiyah', url: 'https://mubarkiyah.com/search?q=%D8%AD%D9%84%D9%8A%D8%A8' },
];

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });

  for (const store of stores) {
    const page = await context.newPage();
    try {
      console.log(`\n--- [${store.name.toUpperCase()}] Damping links from ${store.url}...`);
      await page.goto(store.url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(4000);
      
      const anchors = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a'));
        return links
          .map(a => ({ text: a.innerText.trim(), href: a.href, html: a.outerHTML.substring(0, 150) }))
          .filter(a => a.href && !a.href.startsWith('javascript') && !a.href.includes('#'))
          .slice(0, 50);
      });
      console.log(`Found anchors:`, anchors.filter(a => a.text.length > 2).slice(0, 15));
      
      // Let's also check for any product-card html snippets
      const cardSnippet = await page.evaluate((storeName) => {
        const card = document.querySelector('[class*="product"], [class*="card"], [class*="item"]');
        return card ? card.outerHTML.substring(0, 600) : 'None';
      }, store.name);
      console.log(`Card snippet:`, cardSnippet);
    } catch (e) {
      console.log(`Error: ${e.message}`);
    } finally {
      await page.close();
    }
  }

  await browser.close();
}
run();
