import { chromium } from 'playwright';

async function testPlaywright() {
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  const url = 'https://store.shonaksa.com/ar/search?q=6281057030040';
  console.log(`Navigating to ${url}...`);
  await page.goto(url, { waitUntil: 'networkidle' });
  
  console.log('Page loaded. Waiting for 3 seconds...');
  await page.waitForTimeout(3000);

  console.log('Evaluating DOM...');
  const data = await page.evaluate(() => {
    // Let's get all product links or card elements
    const results: any[] = [];
    
    // Salla custom components (e-commerce elements often start with s-)
    const sProducts = Array.from(document.querySelectorAll('s-product-card, .product-card, .product-item, [class*="product"]'));
    
    // Find all links that contain /p/
    const links = Array.from(document.querySelectorAll('a[href*="/p/"]'));
    
    // Get all text content
    const bodyText = document.body.innerText;
    
    return {
      sProductsCount: sProducts.length,
      linksCount: links.length,
      links: links.slice(0, 15).map((a: any) => ({
        href: a.href,
        text: a.innerText?.trim()
      })),
      hasNoResultsText: bodyText.includes('لا يوجد') || bodyText.includes('عذراً') || bodyText.includes('لم يتم العثور'),
      bodyTextSnippet: bodyText.slice(0, 1000)
    };
  });

  console.log('Results:', JSON.stringify(data, null, 2));

  await browser.close();
}

testPlaywright().catch(console.error);
