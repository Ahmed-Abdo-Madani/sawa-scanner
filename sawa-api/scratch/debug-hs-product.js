const { chromium } = require('playwright');
const path = require('path');

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  const url = 'https://hungerstation.com/sa-en/qc/61039/Meat-More/branch/riyadh~sahafah~106503/product/minced-chicken/55531485';
  console.log(`Navigating to ${url}...`);
  
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    console.log('Page loaded. Waiting 5 seconds...');
    await page.waitForTimeout(5000);

    const title = await page.title();
    console.log(`Title: ${title}`);

    // Check if there's any text indicating closed state or if the product details could be found
    const bodyText = await page.innerText('body');
    const closedKeywords = ['closed', 'currently not accepting', 'busy', 'unavailable', 'مغلق', 'لا يقبل طلبات', 'not active'];
    const foundKeywords = closedKeywords.filter(kw => bodyText.toLowerCase().includes(kw.toLowerCase()));
    
    console.log(`Found closed keywords in page body:`, foundKeywords);
    console.log(`Page innerText length: ${bodyText.length}`);
    
    // Print H1 and other possible detail elements
    const h1 = await page.innerText('h1').catch(() => 'NO H1');
    console.log(`H1 content: ${h1}`);
    
    // Take screenshot and save to artifacts directory
    const screenshotPath = 'C:\\Users\\Design_Bench_12\\.gemini\\antigravity\\brain\\7fc14901-b6ca-499d-a8e4-98d918d27b7e\\hs_product_debug.png';
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`Screenshot saved to: ${screenshotPath}`);

  } catch (err) {
    console.error('Error during navigation:', err);
  } finally {
    await browser.close();
  }
}

main();
