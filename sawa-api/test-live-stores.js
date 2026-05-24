const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

const stores = [
  { name: 'atayib', url: 'https://www.atayib.com/search?q=6281007120401' },
  { name: 'mubarkiyah', url: 'https://mubarkiyah.com/search?q=6281007120401' },
  { name: 'hsd-sh', url: 'https://hsd-sh.com/search?q=6281007120401' },
  { name: 'nwsha', url: 'https://nwsha.com/search?q=6281007120401' },
  { name: 'alaqialmarkets', url: 'https://alaqialmarkets.net/ar/search?q=6281007120401' },
  { name: 'shaml', url: 'https://shaml.sa/search?q=6281007120401' },
  { name: 'aliaqtisadia', url: 'https://aliaqtisadia.sa/search?q=6281007120401' },
  { name: 'mo3en', url: 'https://mo3en.com/ar/search?q=6281007120401' },
  { name: 'mo0o0nat', url: 'https://mo0o0nat.com/products?q=6281007120401' },
  { name: 'narjs', url: 'https://narjs.store/search?q=6281007120401' },
  { name: 'talbatuk', url: 'https://talbatuk.com/products?q=6281007120401' },
  { name: 'waw', url: 'https://waw.sa/search/node/6281007120401' },
  { name: 'dukanexpress', url: 'https://dukanexpress.com/products?q=6281007120401' },
  { name: 'eanaab', url: 'https://eanaab.com/search?q=6281022118087' },
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
      console.log(`\n--- [${store.name.toUpperCase()}] Visiting ${store.url}...`);
      await page.goto(store.url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(2000); // organic wait for hydration
      
      const title = await page.title();
      console.log(`Page Title: ${title}`);
      
      // Dump a few HTML highlights or check if it matches Salla/Zid structures
      const bodyHtml = await page.content();
      
      let detectedType = 'unknown';
      if (bodyHtml.includes('salla-product-card') || bodyHtml.includes('class="product-card') || bodyHtml.includes('product-card')) {
        detectedType = 'Salla Card';
      }
      
      // Let's grab some links and texts
      const links = await page.evaluate(() => {
        const anchors = Array.from(document.querySelectorAll('a'));
        return anchors
          .map(a => ({ text: a.innerText.trim(), href: a.href }))
          .filter(a => a.text.length > 3 && a.href.includes('/p/'));
      });
      console.log(`Detected type hint: ${detectedType}`);
      console.log(`Found /p/ links count: ${links.length}`);
      if (links.length > 0) {
        console.log('Sample matches:', links.slice(0, 3));
      } else {
        // Look for any links with prices or titles
        const allLinks = await page.evaluate(() => {
          const anchors = Array.from(document.querySelectorAll('a'));
          return anchors
            .map(a => ({ text: a.innerText.trim(), href: a.href }))
            .filter(a => a.text.length > 5 && a.href.includes('/product'));
        });
        console.log('Sample alternative product links:', allLinks.slice(0, 3));
      }
    } catch (e) {
      console.log(`Failed to scrape ${store.name}: ${e.message}`);
    } finally {
      await page.close();
    }
  }

  await browser.close();
  console.log('\nFinished all diagnostics.');
}

run();
