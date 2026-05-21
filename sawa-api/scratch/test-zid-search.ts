import { chromium } from 'playwright';

const stores = [
  'https://parkcentersa.com',
  'https://menhal.sa'
];

async function checkZidSearch() {
  console.log('🔍 Diagnostic: Analyzing Zid stores search mechanisms using Playwright...');
  const browser = await chromium.launch({ headless: true });

  for (const store of stores) {
    console.log(`\n==================================================`);
    console.log(`STORE: ${store}`);
    const page = await browser.newPage();

    try {
      // Set User Agent
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8'
      });

      const listingUrl = `${store}/products`;
      console.log(`Navigating to listing page: ${listingUrl}`);
      const res = await page.goto(listingUrl, { waitUntil: 'load', timeout: 30000 });
      console.log(`HTTP Status: ${res?.status()}`);

      await page.waitForTimeout(2000);

      // Inspect forms and search inputs
      const formInfo = await page.evaluate(() => {
        const forms = Array.from(document.querySelectorAll('form'));
        const formsData = forms.map((f, idx) => {
          const action = f.getAttribute('action') || '';
          const method = f.getAttribute('method') || '';
          const inputs = Array.from(f.querySelectorAll('input')).map(i => ({
            name: i.getAttribute('name'),
            type: i.getAttribute('type'),
            placeholder: i.getAttribute('placeholder') || ''
          }));
          return { index: idx + 1, action, method, inputs };
        });

        const searchInputs = Array.from(document.querySelectorAll('input')).map(i => ({
          name: i.getAttribute('name'),
          type: i.getAttribute('type'),
          placeholder: i.getAttribute('placeholder') || '',
          class: i.className
        })).filter(i => 
          i.type === 'search' || 
          i.name?.toLowerCase().includes('search') || 
          i.placeholder.includes('بحث') || 
          i.placeholder.toLowerCase().includes('search')
        );

        return { formsData, searchInputs };
      });

      console.log(`Forms found:`, JSON.stringify(formInfo.formsData, null, 2));
      console.log(`Search inputs found:`, JSON.stringify(formInfo.searchInputs, null, 2));

      // Test searching using typical Zid parameters or typing in input
      let searchInputFound = false;
      const selectors = ['input[type="search"]', 'input[name="q"]', 'input[name="search"]', 'input[placeholder*="بحث"]'];
      let selectedSelector = '';

      for (const sel of selectors) {
        const handle = await page.$(sel);
        if (handle) {
          const visible = await handle.isVisible();
          if (visible) {
            selectedSelector = sel;
            searchInputFound = true;
            break;
          }
        }
      }

      if (searchInputFound) {
        console.log(`Found active search input with selector: "${selectedSelector}". Typing query 'شاي'...`);
        await page.fill(selectedSelector, 'شاي');
        await page.press(selectedSelector, 'Enter');
        
        await page.waitForTimeout(4000);
        const finalUrl = page.url();
        console.log(`Redirected URL after search: ${finalUrl}`);
        console.log(`Title: ${await page.title()}`);

        const productCardsCount = await page.evaluate(() => {
          // Zid product grid selectors: look for elements with product card classes
          const cards = document.querySelectorAll('.product-card, .product-item, [class*="product-card"], [class*="product-item"], [class*="product_card"], [class*="product_item"]');
          return cards.length;
        });
        console.log(`Potential product cards visible: ${productCardsCount}`);
      } else {
        console.log('No visible search input found on /products.');
      }

    } catch (e: any) {
      console.error(`❌ Error parsing ${store}: ${e.message}`);
    } finally {
      await page.close();
    }
  }

  await browser.close();
}

checkZidSearch();
