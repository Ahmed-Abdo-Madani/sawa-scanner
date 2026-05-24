const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();
  try {
    const url = 'https://waw.sa/product/19740';
    console.log(`Visiting WAW product page: ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(4000);

    const info = await page.evaluate(() => {
      // 1. JSON-LD scripts
      const ldScripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
        .map(s => s.textContent);

      // 2. Metas
      const metas = Array.from(document.querySelectorAll('meta'))
        .map(m => ({
          property: m.getAttribute('property'),
          name: m.getAttribute('name'),
          content: m.getAttribute('content')
        }));

      // 3. Let's find images
      const images = Array.from(document.querySelectorAll('img'))
        .map(img => img.src)
        .filter(src => src.includes('/product') || src.includes('/files/'));

      // 4. Exact product title / name inside breadcrumb active state or header
      const name = document.querySelector('h1')?.innerText?.trim() || 
                   document.querySelector('.active')?.innerText?.trim() || '';

      // 5. Let's find any barcodes by searching innerHTML
      const htmlText = document.body.innerHTML;
      const barcodes = htmlText.match(/628\d{10}/g) || [];

      return {
        ldScripts,
        metas: metas.filter(m => m.property || m.name),
        images,
        name,
        barcodes
      };
    });

    console.log('=== WAW METADATA ===');
    console.log(JSON.stringify(info, null, 2));
  } catch (e) {
    console.log(`Error: ${e.message}`);
  } finally {
    await page.close();
  }

  await browser.close();
}
run();
