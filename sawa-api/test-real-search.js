const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

const stores = [
  { name: 'atayib', searchUrl: 'https://www.atayib.com/search?q=%D8%A7%D9%84%D9%85%D8%B1%D8%A7%D8%B9%D9%8A' },
  { name: 'mubarkiyah', searchUrl: 'https://mubarkiyah.com/search?q=%D8%A7%D9%84%D9%85%D8%B1%D8%A7%D8%B9%D9%8A' },
  { name: 'hsd-sh', searchUrl: 'https://hsd-sh.com/search?q=%D8%A7%D9%84%D9%85%D8%B1%D8%A7%D8%B9%D9%8A' },
  { name: 'nwsha', searchUrl: 'https://nwsha.com/search?q=%D8%A7%D9%84%D9%85%D8%B1%D8%A7%D8%B9%D9%8A' },
  { name: 'alaqialmarkets', searchUrl: 'https://alaqialmarkets.net/ar/search?q=%D8%A7%D9%84%D9%85%D8%B1%D8%A7%D8%B9%D9%8A' },
  { name: 'shaml', searchUrl: 'https://shaml.sa/search?q=%D8%A7%D9%84%D9%85%D8%B1%D8%A7%D8%B9%D9%8A' },
  { name: 'aliaqtisadia', searchUrl: 'https://aliaqtisadia.sa/search?q=%D8%A7%D9%84%D9%85%D8%B1%D8%A7%D8%B9%D9%8A' },
  { name: 'mo3en', searchUrl: 'https://mo3en.com/ar/search?q=%D8%A7%D9%84%D9%85%D8%B1%D8%A7%D8%B9%D9%8A' },
  { name: 'mo0o0nat', searchUrl: 'https://mo0o0nat.com/products?q=%D8%A7%D9%84%D9%85%D8%B1%D8%A7%D8%B9%D9%8A' },
  { name: 'narjs', searchUrl: 'https://narjs.store/search?q=%D8%A7%D9%84%D9%85%D8%B1%D8%A7%D8%B9%D9%8A' },
  { name: 'talbatuk', searchUrl: 'https://talbatuk.com/products?q=%D8%A7%D9%84%D9%85%D8%B1%D8%A7%D8%B9%D9%8A' },
  { name: 'waw', searchUrl: 'https://waw.sa/search/node/%D8%A7%D9%84%D9%85%D8%B1%D8%A7%D8%B9%D9%8A' },
  { name: 'dukanexpress', searchUrl: 'https://dukanexpress.com/products?q=%D8%A7%D9%84%D9%85%D8%B1%D8%A7%D8%B9%D9%8A' },
  { name: 'eanaab', searchUrl: 'https://eanaab.com/search?q=%D8%A7%D9%84%D9%85%D8%B1%D8%A7%D8%B9%D9%8A' },
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
      console.log(`\n--- [${store.name.toUpperCase()}] Searching Almarai at ${store.searchUrl}...`);
      await page.goto(store.searchUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(3000); // Wait for results hydration
      
      const title = await page.title();
      console.log(`Page Title: ${title}`);
      
      // Extract first product card link, price, and name
      const results = await page.evaluate((storeName) => {
        let items = [];
        
        // 1. Salla card selectors
        const sallaCards = document.querySelectorAll('salla-product-card, .product-card, [class*="product-card"]');
        if (sallaCards.length > 0) {
          sallaCards.forEach((card) => {
            const anchor = card.querySelector('a');
            const nameEl = card.querySelector('.title, [class*="title"], h3, [class*="name"]');
            const priceEl = card.querySelector('.price, [class*="price"]');
            if (anchor && nameEl) {
              items.push({
                source: 'Salla DOM Card',
                name: nameEl.innerText.trim(),
                url: anchor.href,
                price: priceEl ? priceEl.innerText.trim() : 'N/A'
              });
            }
          });
        }
        
        // 2. Generic anchors containing product link
        if (items.length === 0) {
          const anchors = Array.from(document.querySelectorAll('a'));
          anchors.forEach((a) => {
            const href = a.href || '';
            const text = a.innerText.trim();
            if (text.length > 5 && (href.includes('/p/') || href.includes('/product/') || href.includes('/products/'))) {
              items.push({
                source: 'Anchor href match',
                name: text,
                url: href,
                price: 'N/A'
              });
            }
          });
        }
        
        return items.slice(0, 3);
      }, store.name);
      
      console.log(`Found matches: ${results.length}`);
      if (results.length > 0) {
        console.log('Top Results:', results);
      } else {
        // Log DOM snippet
        const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 500));
        console.log('[No Match] Screen text:', bodyText.replace(/\n+/g, ' '));
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
