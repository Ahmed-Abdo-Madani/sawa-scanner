import { chromium } from 'playwright';

const stores = [
  'https://store.shonaksa.com',
  'https://yasminstore.com/ar',
  'https://mrlogman.com/ar/?lang=ar'
];

async function findSearchAction() {
  console.log('🚀 Checking search form actions via Playwright...');
  const browser = await chromium.launch({ headless: true });

  for (const store of stores) {
    console.log(`\n==================================================`);
    console.log(`STORE: ${store}`);
    const page = await browser.newPage();
    try {
      await page.goto(store, { waitUntil: 'load', timeout: 30000 });
      await page.waitForTimeout(2000);

      // Find all inputs that look like search
      const searchInputs = await page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input'));
        return inputs.map(i => ({
          name: i.name,
          placeholder: i.placeholder,
          type: i.type,
          class: i.className,
          id: i.id
        })).filter(i => 
          i.name?.toLowerCase().includes('search') || 
          i.placeholder?.toLowerCase().includes('search') ||
          i.placeholder?.includes('بحث') ||
          i.type === 'search' ||
          i.class?.toLowerCase().includes('search')
        );
      });

      console.log('Search inputs found:', searchInputs);

      // Check if there's a search form action
      const formActions = await page.evaluate(() => {
        const forms = Array.from(document.querySelectorAll('form'));
        return forms.map(f => ({
          action: f.getAttribute('action'),
          method: f.getAttribute('method'),
          class: f.className
        })).filter(f => 
          f.action?.toLowerCase().includes('search') || 
          f.class?.toLowerCase().includes('search')
        );
      });

      console.log('Search forms found:', formActions);

      // If we can find an input, let's type 'شاي' and submit!
      let inputSelector = 'input[type="search"]';
      let exists = await page.$(inputSelector);
      if (!exists) {
        inputSelector = 'input[name="q"]';
        exists = await page.$(inputSelector);
      }
      if (!exists) {
        inputSelector = 'input[placeholder*="بحث"]';
        exists = await page.$(inputSelector);
      }

      if (exists) {
        console.log(`Typing search query using selector: ${inputSelector}`);
        await page.fill(inputSelector, 'شاي');
        await page.press(inputSelector, 'Enter');
        
        await page.waitForTimeout(5000);
        const finalUrl = page.url();
        console.log(`Redirected URL after search submit: ${finalUrl}`);
        
        const title = await page.title();
        console.log(`Search Page Title: ${title}`);
        
        const bodyText = await page.evaluate(() => document.body.innerText);
        console.log(`Search Page Body Length: ${bodyText.length}`);
        if (bodyText.length < 500) {
          console.log(`Raw Body Content: ${bodyText}`);
        } else {
          console.log(`Body Snippet:\n${bodyText.substring(0, 500)}`);
        }
      } else {
        console.log('Could not find search input to fill.');
      }

    } catch (error: any) {
      console.error(`❌ Error checking ${store}:`, error.message);
    } finally {
      await page.close();
    }
  }

  await browser.close();
}

findSearchAction();
