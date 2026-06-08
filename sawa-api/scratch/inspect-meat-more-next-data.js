const { chromium } = require('playwright');
const fs = require('fs');

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  const url = 'https://hungerstation.com/sa-en/qc/61039/Meat-More/branch/riyadh~sahafah~106503';
  console.log(`Navigating to ${url}...`);
  
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);

    const nextDataJson = await page.evaluate(() => {
      const script = document.getElementById('__NEXT_DATA__');
      return script ? JSON.parse(script.textContent) : null;
    });

    if (!nextDataJson) {
      console.log('No __NEXT_DATA__ found');
      return;
    }

    // Let's write a sample of the pageProps to inspect the product nodes!
    const pageProps = nextDataJson.props?.pageProps || {};
    
    // We want to find any raw product objects inside the JSON.
    const products = [];
    const findProducts = (val) => {
      if (!val || typeof val !== 'object') return;
      if (Array.isArray(val)) {
        val.forEach(findProducts);
        return;
      }
      if (val.id && (val.name || val.title) && (val.price !== undefined || val.pricing)) {
        products.push(val);
      }
      Object.values(val).forEach(findProducts);
    };
    findProducts(pageProps);

    console.log(`Found ${products.length} product-like nodes in __NEXT_DATA__.`);
    if (products.length > 0) {
      console.log('First 3 product nodes sample:');
      console.log(JSON.stringify(products.slice(0, 3), null, 2));
    }

    fs.writeFileSync('scratch/meat-more-pageprops-sample.json', JSON.stringify(pageProps, (key, value) => {
      if (typeof value === 'string' && value.length > 300) return value.substring(0, 300) + '...';
      if (Array.isArray(value) && value.length > 5) return [value[0], `... (${value.length - 1} more items)`];
      return value;
    }, 2));

    console.log('Saved meat-more pageProps sample to scratch folder.');

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await browser.close();
  }
}

main();
