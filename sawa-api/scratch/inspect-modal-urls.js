const { chromium } = require('playwright');

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
    console.log('Page loaded. Waiting for product element to be clickable...');
    await page.waitForTimeout(3000);

    // Let's print out what elements might be product items
    // Clicking on the first element that looks like a product card
    const selectors = [
      '//div[contains(text(), "Iraqi Lamb Kabab")]',
      '//h3[contains(text(), "Iraqi Lamb Kabab")]',
      '[class*="product"]',
      '[class*="item"]'
    ];

    let clicked = false;
    for (const selector of selectors) {
      try {
        console.log(`Trying to click selector: ${selector}`);
        await page.click(selector, { timeout: 3000 });
        console.log(`Clicked ${selector}! Waiting 3s...`);
        await page.waitForTimeout(3000);
        clicked = true;
        break;
      } catch (err) {
        console.log(`Failed for ${selector}: ${err.message}`);
      }
    }

    if (clicked) {
      const currentUrl = page.url();
      console.log(`URL after click: ${currentUrl}`);
      
      const bodyHtml = await page.content();
      console.log(`Is modal present in HTML? ${bodyHtml.toLowerCase().includes('modal') || bodyHtml.toLowerCase().includes('dialog')}`);
      
      const h1s = await page.evaluate(() => Array.from(document.querySelectorAll('h1, h2')).map(el => el.innerText));
      console.log('H1/H2 elements present now:', h1s);
      
      // Let's take a screenshot of the page with the modal
      const screenshotPath = 'C:\\Users\\Design_Bench_12\\.gemini\\antigravity\\brain\\7fc14901-b6ca-499d-a8e4-98d918d27b7e\\hs_modal_debug.png';
      await page.screenshot({ path: screenshotPath });
      console.log(`Modal screenshot saved to: ${screenshotPath}`);
    } else {
      console.log('Could not click any product elements.');
    }

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await browser.close();
  }
}

main();
