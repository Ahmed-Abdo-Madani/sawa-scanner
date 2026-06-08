import { chromium } from 'playwright-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';

// @ts-ignore
chromium.use(stealthPlugin());

async function testScroll() {
  const catUrl = 'https://yasminstore.com/ar/%D9%85%D9%86%D8%B2%D9%84%D9%8A%D8%A9-%D8%AA%D9%86%D8%B8%D9%8A%D9%81/c1839915840';
  console.log(`🌐 Opening page for scrolling test: ${catUrl}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(catUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const initialCount = await page.evaluate(() => {
      return document.querySelectorAll('custom-salla-product-card, salla-product-card').length;
    });
    console.log(`Initial product count: ${initialCount}`);

    // Let's scroll down multiple times
    let scrollCount = 0;
    let lastHeight = await page.evaluate('document.body.scrollHeight');
    
    while (scrollCount < 10) {
      console.log(`Scrolling down (Step ${scrollCount + 1})...`);
      await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
      await page.waitForTimeout(2000); // Wait for dynamic load
      
      const currentCount = await page.evaluate(() => {
        return document.querySelectorAll('custom-salla-product-card, salla-product-card').length;
      });
      const newHeight = await page.evaluate('document.body.scrollHeight');
      
      console.log(`Current product count: ${currentCount}, Scroll Height: ${newHeight}`);
      
      if (newHeight === lastHeight) {
        console.log('Scroll height did not change. Checking if more cards loaded...');
        // Let's wait another second and scroll again to be sure
        await page.evaluate('window.scrollTo(0, document.body.scrollHeight - 500)');
        await page.waitForTimeout(500);
        await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
        await page.waitForTimeout(1500);
        
        const finalCheckCount = await page.evaluate(() => {
          return document.querySelectorAll('custom-salla-product-card, salla-product-card').length;
        });
        const finalHeight = await page.evaluate('document.body.scrollHeight');
        if (finalHeight === newHeight && finalCheckCount === currentCount) {
          console.log('Reached the end of the scroll list.');
          break;
        }
      }
      
      lastHeight = newHeight;
      scrollCount++;
    }

    const finalProducts = await page.evaluate(() => {
      const cards = document.querySelectorAll('custom-salla-product-card, salla-product-card');
      return Array.from(cards).map((c: any) => {
        const titleEl = c.querySelector('h1, h2, h3, h4, h5, .title, .name');
        return titleEl?.textContent?.trim() || '';
      });
    });

    console.log(`Total products parsed after scroll: ${finalProducts.length}`);
    console.log('Sample products:', finalProducts.slice(0, 10));

  } catch (err: any) {
    console.error(`❌ Error: ${err.message}`);
  } finally {
    await browser.close();
  }
}

testScroll();
