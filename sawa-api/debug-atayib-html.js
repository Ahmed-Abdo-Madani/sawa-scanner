const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

async function run() {
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();
  try {
    console.log(`Visiting Atayib search page for 'milk'...`);
    await page.goto('https://www.atayib.com/en/search?q=milk', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(4000);
    
    const pageTitle = await page.title();
    console.log('Page Title:', pageTitle);
    
    // Dump all links on the page that look like products
    const links = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('a'));
      return anchors
        .map(a => ({ text: a.innerText.trim(), href: a.href, html: a.outerHTML.substring(0, 150) }))
        .filter(a => a.href && !a.href.startsWith('javascript') && !a.href.includes('#') && a.text.length > 2);
    });
    
    console.log(`Found anchors on Atayib search page: ${links.length}`);
    console.log('Sample anchors:', links.slice(0, 30));
    
    // Let's dump all card class elements
    const cards = await page.evaluate(() => {
      const cardEls = document.querySelectorAll('.art, .product-item, .product-card, [class*="product"], [class*="card"]');
      return Array.from(cardEls).map(c => ({
        tagName: c.tagName,
        className: c.className,
        html: c.outerHTML.substring(0, 300)
      })).slice(0, 10);
    });
    console.log(`Card elements found:`, cards);
  } catch (e) {
    console.log(`Error: ${e.message}`);
  } finally {
    await page.close();
  }

  await browser.close();
}
run();
