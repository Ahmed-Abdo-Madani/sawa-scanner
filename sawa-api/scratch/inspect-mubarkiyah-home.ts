import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
chromium.use(StealthPlugin());

async function run() {
  console.log('🚀 Launching browser to inspect mubarkiyah.com...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();
  try {
    await page.goto('https://mubarkiyah.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);

    // 1. Get all category links on the homepage
    const links = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('a'));
      return anchors.map(a => ({
        href: a.href,
        text: a.innerText.trim(),
        html: a.outerHTML
      })).filter(a => a.href.includes('category') || a.href.includes('c=') || a.href.includes('dept') || a.href.includes('menu'));
    });

    console.log('--- CATEGORY/DEPT LINKS FOUND ---');
    console.log(JSON.stringify(links, null, 2));

    // 2. Look for hydration script id="__NEXT_DATA__"
    const nextData = await page.evaluate(() => {
      const script = document.querySelector('script[id="__NEXT_DATA__"]');
      if (!script) return null;
      try {
        return JSON.parse(script.textContent || '');
      } catch (e) {
        return 'Parse error';
      }
    });

    if (nextData && nextData !== 'Parse error') {
      console.log('🎉 Found __NEXT_DATA__ on homepage!');
      const fs = require('fs');
      fs.writeFileSync('./scratch/mubarkiyah-home-next-data.json', JSON.stringify(nextData, null, 2));
      console.log('Saved to scratch/mubarkiyah-home-next-data.json');
      
      // Print keys of pageProps
      const pageProps = nextData.props?.pageProps;
      console.log('Keys of pageProps:', pageProps ? Object.keys(pageProps) : 'None');
      if (pageProps) {
        // Look for categories/departments tree
        for (const key of Object.keys(pageProps)) {
          if (Array.isArray(pageProps[key])) {
            console.log(`Array prop "${key}" length: ${pageProps[key].length}`);
            if (pageProps[key].length > 0) {
              console.log(`Sample from "${key}":`, JSON.stringify(pageProps[key][0], null, 2));
            }
          } else if (typeof pageProps[key] === 'object' && pageProps[key] !== null) {
            console.log(`Object prop "${key}" keys:`, Object.keys(pageProps[key]));
          }
        }
      }
    } else {
      console.log('❌ __NEXT_DATA__ not found or invalid.');
    }

  } catch (e: any) {
    console.error(`Error: ${e.message}`);
  } finally {
    await browser.close();
  }
}

run();
