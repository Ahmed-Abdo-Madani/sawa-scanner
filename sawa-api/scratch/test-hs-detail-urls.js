const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  const id = '55531485';
  const nameSlug = 'minced-chicken';
  const branchPath = 'sa-en/qc/61039/Meat-More/branch/riyadh~sahafah~106503';
  
  const urls = [
    `https://hungerstation.com/sa-en/product/${nameSlug}/${id}`,
    `https://hungerstation.com/sa-en/product/${id}`,
    `https://hungerstation.com/sa-en/item/${id}`,
    `https://hungerstation.com/sa-en/items/${id}`,
    `https://hungerstation.com/${branchPath}/product/${nameSlug}/${id}`,
    `https://hungerstation.com/${branchPath}/product/${id}`,
    `https://hungerstation.com/${branchPath}/item/${id}`,
    `https://hungerstation.com/${branchPath}/items/${id}`,
    // Let's try the Arabic version too
    `https://hungerstation.com/sa-ar/product/${nameSlug}/${id}`,
  ];

  for (const url of urls) {
    console.log(`Testing: ${url}`);
    try {
      const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });
      const title = await page.title();
      const status = res ? res.status() : 'No response';
      console.log(`   -> Status: ${status}, Title: ${title}`);
    } catch (err) {
      console.log(`   -> Error: ${err.message}`);
    }
  }

  await browser.close();
}

main();
