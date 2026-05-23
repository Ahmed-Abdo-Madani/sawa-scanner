const { chromium } = require('playwright');

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const productUrl = 'https://store.shonaksa.com/ارز-بنجابي-شونة-عنبر-5-ك/p99700396';
  console.log(`Navigating to product detail page: ${productUrl}`);
  
  await page.goto(productUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  
  console.log('Page Title:', await page.title());
  
  // 1. Get all application/ld+json contents
  const ldJsonTexts = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
      .map(s => s.textContent);
  });
  console.log('--- JSON-LD contents ---');
  ldJsonTexts.forEach((text, i) => {
    console.log(`Script ${i}:`, text);
  });
  
  // 2. Get all price meta tags
  const metas = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('meta'))
      .map(m => ({ name: m.name, property: m.getAttribute('property'), content: m.content }))
      .filter(m => {
        const str = JSON.stringify(m).toLowerCase();
        return str.includes('price') || str.includes('amount');
      });
  });
  console.log('--- Meta tags containing price/amount ---');
  console.log(metas);
  
  // 3. Find any element containing 36.95 or 42.22
  const matchingElements = await page.evaluate(() => {
    const results = [];
    const elements = document.querySelectorAll('*');
    for (const el of Array.from(elements)) {
      if (el.children.length === 0 && (el.textContent.includes('36.95') || el.textContent.includes('42.22'))) {
        results.push({
          tagName: el.tagName,
          className: el.className,
          id: el.id,
          text: el.textContent.trim(),
          parents: el.parentElement.tagName + '.' + el.parentElement.className
        });
      }
    }
    return results;
  });
  console.log('--- Matching elements containing 36.95 or 42.22 ---');
  console.log(matchingElements);
  
  await browser.close();
}

run().catch(console.error);
