const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  const url = 'https://hungerstation.com/sa-en/qc/61039/Meat-More/branch/riyadh~sahafah~106503';
  console.log(`Navigating to ${url}...`);
  
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    console.log('Page loaded. Waiting for product anchors...');
    
    // Wait up to 10 seconds for any links matching items/product
    await page.waitForSelector('a[href*="/items/"], a[href*="/item/"], a[href*="/product/"]', { timeout: 10000 }).catch(() => undefined);
    
    const productLinks = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('a'));
      return anchors
        .map(a => ({
          text: a.innerText?.trim() || '',
          href: a.getAttribute('href') || '',
        }))
        .filter(x => x.href.includes('/items/') || x.href.includes('/item/') || x.href.includes('/product/'));
    });
    
    console.log(`Total product links found: ${productLinks.length}`);
    console.log('--- First 20 product links ---');
    console.log(JSON.stringify(productLinks.slice(0, 20), null, 2));

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await browser.close();
  }
}

main();
