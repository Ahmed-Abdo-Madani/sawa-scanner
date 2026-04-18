import { chromium } from 'playwright';

async function inspectNinja() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('--- Inspecting Ninja CatalogProducts GQL ---');

  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('/graphql')) {
      try {
        const body = await response.json();
        const opName = body[0]?.operationName || body.operationName;
        if (opName === 'CatalogProducts') {
          const products =
            body[0]?.data?.catalogProducts?.elements ||
            body.data?.catalogProducts?.elements;
          if (products && products.length > 0) {
            console.log('Sample Product from GQL:');
            console.log(JSON.stringify(products[0], null, 2));
          }
        }
      } catch (e) {}
    }
  });

  await page.goto('https://ananinja.com/sa/en/category/dairy-eggs', {
    waitUntil: 'networkidle',
  });
  await new Promise((r) => setTimeout(r, 5000));
  await browser.close();
}

inspectNinja();
