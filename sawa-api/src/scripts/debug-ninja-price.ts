import { chromium, Response } from 'playwright';

async function run() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  let productData: any = null;

  page.on('response', async (response: Response) => {
    if (response.url().includes('graphql.ananinja.com')) {
      try {
        const json = await response.json();

        const recursiveFind = (obj: any) => {
          if (!obj || typeof obj !== 'object') return;
          if (
            obj.productId === '19304137' ||
            obj.id === '19304137' ||
            obj.gtin === '19304137'
          ) {
            productData = obj;
          }
          if (!productData) {
            for (const key in obj) {
              recursiveFind(obj[key]);
            }
          }
        };
        recursiveFind(json);
      } catch (e) {}
    }
  });

  console.log('Navigating to product page...');
  await page.goto('https://ananinja.com/sa/en/product/19304137', {
    waitUntil: 'networkidle',
  });
  await page.waitForTimeout(5000);

  if (productData) {
    console.log('--- PRODUCT DATA FOUND ---');
    console.log(JSON.stringify(productData, null, 2));
  } else {
    console.log('Product data not found in GQL responses.');
    // Try hydration data
    const scripts = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('script')).map(
        (s) => s.textContent,
      );
    });

    for (const content of scripts) {
      if (content?.includes('19304137')) {
        console.log('--- SCRIPT CONTENT CONTAINING ID FOUND ---');
        // We'll just dump a snippet
        const chunk = content.substring(
          content.indexOf('19304137') - 500,
          content.indexOf('19304137') + 2000,
        );
        console.log(chunk);
      }
    }
  }

  await browser.close();
}

run();
