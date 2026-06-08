import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  console.log('Navigating to Etaam Express category page...');
  await page.goto('https://etaamexpress.com/ar/-/c699784095', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    const cardCount = await page.evaluate(() => {
      return document.querySelectorAll('custom-salla-product-card, salla-product-card').length;
    });
    console.log(`Attempt ${attempts}: Card count before click = ${cardCount}`);

    // Scroll to the bottom to bring the button into view/trigger lazy loading
    await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
    await page.waitForTimeout(1000);

    // Check if the button exists and is visible
    const buttonSelector = 'button.s-infinite-scroll-btn';
    const isButtonVisible = await page.evaluate((sel) => {
      const btn = document.querySelector(sel) as HTMLButtonElement | null;
      if (!btn) return false;
      const rect = btn.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && btn.style.display !== 'none';
    }, buttonSelector);

    console.log(`Button visible: ${isButtonVisible}`);

    if (!isButtonVisible) {
      console.log('Load More button is not visible or doesn\'t exist. Stopping.');
      break;
    }

    // Click the button
    await page.click(buttonSelector);
    console.log('Clicked "Load More" button.');

    // Wait for content to load
    await page.waitForTimeout(2500);
    attempts++;
  }

  const finalCardCount = await page.evaluate(() => {
    return document.querySelectorAll('custom-salla-product-card, salla-product-card').length;
  });
  console.log(`Final Card count = ${finalCardCount}`);

  await browser.close();
}

main().catch(console.error);
