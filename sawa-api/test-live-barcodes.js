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
      console.log(`\n--- [${store.name.toUpperCase()}] Searching barcode at ${store.url}...`);
      await page.goto(store.url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(3000); // organic wait for hydration
      
      const title = await page.title();
      console.log(`Page Title: ${title}`);
      
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
              const nameText = nameEl.innerText.trim();
              if (nameText) {
                items.push({
                  source: 'Salla DOM Card',
                  name: nameText,
                  url: anchor.href,
                  price: priceEl ? priceEl.innerText.trim() : 'N/A'
                });
              }
            }
          });
        }
        
        // 2. Generic anchors containing product link
        if (items.length === 0) {
          const anchors = Array.from(document.querySelectorAll('a'));
          anchors.forEach((a) => {
            const href = a.href || '';
            const text = a.innerText.trim();
            if (text.length > 3 && (href.includes('/p/') || href.includes('/product/') || href.includes('/products/'))) {
              items.push({
                source: 'Anchor href match',
                name: text,
                url: href,
                price: 'N/A'
              });
            }
          });
        }

        // 3. Fallback: print body text snippet if nothing found
        return items;
      }, store.name);
      
      // Filter out duplicate urls
      const uniqueResults = [];
      const seenUrls = new Set();
      for (const item of results) {
        if (!seenUrls.has(item.url)) {
          seenUrls.add(item.url);
          uniqueResults.push(item);
        }
      }
      
      console.log(`Found unique matches: ${uniqueResults.length}`);
      if (uniqueResults.length > 0) {
        console.log('Results:', uniqueResults.slice(0, 3));
      } else {
        const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 300));
        console.log('[No Match] Screen text snippet:', bodyText.replace(/\n+/g, ' '));
      }
    } catch (e) {
      console.log(`Failed to scrape ${store.name}: ${e.message}`);
    } finally {
      await page.close();
    }
  }

  await browser.close();
  console.log('\nFinished all barcode tests.');
}

run();
