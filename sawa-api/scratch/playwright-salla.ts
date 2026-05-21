import { chromium } from 'playwright';

async function testPlaywrightSalla() {
  console.log('🚀 Running Playwright inspection of Salla stores...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Listen to network requests to see if Salla calls an API
  page.on('request', request => {
    const url = request.url();
    if (url.includes('search') || url.includes('api') || url.includes('products')) {
      console.log(`📡 Network Request: [${request.method()}] ${url}`);
    }
  });

  try {
    const searchUrl = 'https://store.shonaksa.com/ar/search?q=شاي';
    console.log(`\nNavigating to: ${searchUrl}`);
    await page.goto(searchUrl, { waitUntil: 'load', timeout: 30000 });
    
    // Wait for Vue/Alpine or any hydration
    await page.waitForTimeout(5000);

    const title = await page.title();
    console.log(`Page Title: ${title}`);

    // Print some of the page text content or check elements
    const bodyText = await page.evaluate(() => document.body.innerText);
    console.log(`Body length: ${bodyText.length} characters`);
    console.log(`First 500 chars of body text:\n${bodyText.substring(0, 500)}`);

    // Let's check for any product cards
    const productCards = await page.evaluate(() => {
      const cards: string[] = [];
      document.querySelectorAll('a, div, salla-button, salla-product-card').forEach(el => {
        const text = el.textContent?.trim() || '';
        if (el.tagName.toLowerCase().startsWith('salla-') || el.className.includes('product')) {
          cards.push(`<${el.tagName.toLowerCase()} class="${el.className}">${text.substring(0, 50)}</${el.tagName.toLowerCase()}>`);
        }
      });
      return cards.slice(0, 15);
    });

    console.log('\nFound elements related to products:', productCards);

  } catch (error: any) {
    console.error('❌ Error during Playwright run:', error);
  } finally {
    await browser.close();
  }
}

testPlaywrightSalla();
