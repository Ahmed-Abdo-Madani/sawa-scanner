import { chromium } from 'playwright-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';

// @ts-ignore
chromium.use(stealthPlugin());

async function testCardDetails() {
  const catUrl = 'https://yasminstore.com/en/food-cabinet/c988350339';
  console.log(`🌐 Opening page: ${catUrl}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(catUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const cardsHtml = await page.evaluate(() => {
      const cards = document.querySelectorAll('custom-salla-product-card, salla-product-card');
      if (cards.length === 0) return [];
      
      return Array.from(cards).slice(0, 3).map((c: any) => {
        // Query some potential price containers
        const priceContainers = Array.from(c.querySelectorAll('*')).map((el: any) => {
          const className = el.className || '';
          if (className.includes('price') || className.includes('amount') || className.includes('cost')) {
            return {
              tagName: el.tagName,
              className: el.className,
              outerHTML: el.outerHTML,
              textContent: el.textContent?.trim(),
            };
          }
          return null;
        }).filter(Boolean);

        return {
          id: c.getAttribute('id'),
          name: c.querySelector('h1, h2, h3, h4, h5, .title, .name')?.textContent?.trim(),
          priceContainers,
        };
      });
    });

    console.log('Price Containers found inside cards:', JSON.stringify(cardsHtml, null, 2));

  } catch (err: any) {
    console.error(`❌ Error: ${err.message}`);
  } finally {
    await browser.close();
  }
}

testCardDetails();
