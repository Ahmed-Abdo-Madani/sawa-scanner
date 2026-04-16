import { chromium } from 'playwright';

async function inspectNinja() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('response', async response => {
    if (response.url().includes('/graphql')) {
        try {
            const body = await response.json();
            const results = body[0]?.data?.catalogProducts?.elements || body.data?.catalogProducts?.elements;
            if (results) {
                console.log('GQL CatalogProducts Full Sample:');
                console.log(JSON.stringify(results[0], null, 2));
            }
        } catch(e) {}
    }
  });

  await page.goto('https://ananinja.com/sa/en/category/dairy-eggs', { waitUntil: 'networkidle' });
  await new Promise(r => setTimeout(r, 5000));
  await browser.close();
}

inspectNinja();
