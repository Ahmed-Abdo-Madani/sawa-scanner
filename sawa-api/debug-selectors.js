const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

const stores = [
  { name: 'atayib', url: 'https://www.atayib.com/search?q=%D8%AD%D9%84%D9%8A%D8%A8' },
  { name: 'mubarkiyah', url: 'https://mubarkiyah.com/search?q=%D8%AD%D9%84%D9%8A%D8%A8' },
];

async function run() {
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });

  for (const store of stores) {
    const page = await context.newPage();
    try {
      console.log(`\n--- [${store.name.toUpperCase()}] Searching 'حليب' at ${store.url}...`);
      await page.goto(store.url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(4000); // organic wait for hydration
      
      const title = await page.title();
      console.log(`Page Title: ${title}`);
      
      // Grab all links on the page containing product-like paths
      const links = await page.evaluate(() => {
        const anchors = Array.from(document.querySelectorAll('a'));
        return anchors
          .map(a => ({
            text: a.innerText.trim(),
            href: a.href,
            parentClass: a.parentElement ? a.parentElement.className : '',
            ancestorClass: a.parentElement && a.parentElement.parentElement ? a.parentElement.parentElement.className : ''
          }))
          .filter(a => a.text.length > 3 && (a.href.includes('/product') || a.href.includes('/p/')));
      });

      console.log(`Found candidate product links: ${links.length}`);
      if (links.length > 0) {
        console.log('Sample product links:', links.slice(0, 5));
      } else {
        // Let's print out all divs with class names containing product or item
        const classes = await page.evaluate(() => {
          const els = Array.from(document.querySelectorAll('div, li, article'));
          return els
            .map(e => e.className)
            .filter(c => typeof c === 'string' && (c.includes('product') || c.includes('item') || c.includes('card')))
            .slice(0, 15);
        });
        console.log('Sample matching class names:', classes);
      }
    } catch (e) {
      console.log(`Failed to scrape ${store.name}: ${e.message}`);
    } finally {
      await page.close();
    }
  }

  await browser.close();
  console.log('\nFinished all selector tests.');
}

run();
