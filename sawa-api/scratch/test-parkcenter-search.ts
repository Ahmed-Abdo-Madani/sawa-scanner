import { chromium } from 'playwright';

async function testParkCenterDirectSearch() {
  console.log('🔍 Testing direct search URL on ParkCenter (Zid)...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    const url = 'https://parkcentersa.com/products?q=%D8%B4%D8%A7%D9%8A'; // 'شاي'
    console.log(`Navigating to: ${url}`);
    await page.goto(url, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(3000);

    console.log(`Final URL: ${page.url()}`);
    console.log(`Page Title: ${await page.title()}`);

    const cardCount = await page.evaluate(() => {
      const cards = document.querySelectorAll('.product-card, .product-item, [class*="product-card"], [class*="product-item"], [class*="product_card"], [class*="product_item"]');
      return cards.length;
    });

    console.log(`Visible product cards on search page: ${cardCount}`);

    const productNames = await page.evaluate(() => {
      const cardTitles = document.querySelectorAll('.product-card .title, .product-card h3, [class*="product-card"] [class*="title"], [class*="product-card"] h3, [class*="product-item"] [class*="title"]');
      return Array.from(cardTitles).slice(0, 10).map(el => el.textContent?.trim());
    });

    console.log(`Sample product names found:`, productNames);

  } catch (e: any) {
    console.error(`❌ Error: ${e.message}`);
  } finally {
    await browser.close();
  }
}

testParkCenterDirectSearch();
