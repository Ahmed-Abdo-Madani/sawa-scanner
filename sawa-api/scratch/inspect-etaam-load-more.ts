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

  // Take selector analysis
  const buttonsInfo = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button, a, salla-button, .s-button'));
    return buttons.map(b => ({
      tagName: b.tagName,
      text: b.textContent?.trim() || '',
      id: b.id,
      className: b.className,
      attributes: Array.from(b.attributes).map(a => `${a.name}="${a.value}"`).join(', ')
    })).filter(b => b.text.includes('تحميل') || b.text.includes('المزيد') || b.className.includes('load-more') || b.text.includes('Load More') || b.attributes.includes('load-more'));
  });

  console.log('Found potential buttons:', JSON.stringify(buttonsInfo, null, 2));

  await browser.close();
}

main().catch(console.error);
