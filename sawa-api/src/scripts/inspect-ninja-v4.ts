import { chromium } from 'playwright';

async function inspectNinja() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('https://ananinja.com/sa/en/category/dairy-eggs', { waitUntil: 'networkidle' });
  
  const products = await page.evaluate(() => {
    // Attempt to find product IDs from the DOM or data attributes
    const elements = Array.from(document.querySelectorAll('a[href*="/product/"]'));
    return elements.map(el => ({
      href: el.getAttribute('href'),
      text: el.textContent?.trim()
    }));
  });
  
  console.log('Product Links from DOM:');
  console.log(JSON.stringify(products.slice(0, 10), null, 2));

  // Also check GraphQL for the 'id' field
  page.on('response', async response => {
    if (response.url().includes('/graphql')) {
        try {
            const body = await response.json();
            const results = body[0]?.data?.catalogProducts?.elements || body.data?.catalogProducts?.elements;
            if (results) {
                console.log('GQL ' + (body[0]?.operationName || body.operationName) + ' Sample:');
                const p = results[0];
                console.log(`Name: ${p.name}`);
                console.log(`ID: ${p.id}`);
                console.log(`ProductId: ${p.productId}`);
                console.log(`Slug: ${p.slug}`);
                console.log(`Handle: ${p.handle}`);
                console.log(`ExternalId: ${p.externalId}`);
                console.log(`GTIN: ${p.gtin}`);
            }
        } catch(e) {}
    }
  });

  await page.evaluate(() => window.scrollBy(0, 5000));
  await new Promise(r => setTimeout(r, 3000));
  
  await browser.close();
}

inspectNinja();
