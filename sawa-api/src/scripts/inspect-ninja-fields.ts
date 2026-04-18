import { chromium } from 'playwright';

async function inspectListingData() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  console.log('Navigating to Lashes category...');
  await page.goto('https://ananinja.com/sa/en/category/lashe', {
    waitUntil: 'networkidle',
  });

  const scriptContents = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('script')).map(
      (s) => s.textContent || '',
    );
  });

  for (const content of scriptContents) {
    if (content.includes('productId')) {
      console.log('--- FOUND POTENTIAL PRODUCT JSON ---');
      const regex = /\{"productId":".+?","name":".+?".+?\}/g;
      const matches = content.match(regex);
      if (matches) {
        console.log(`Found ${matches.length} matches.`);
        console.log('Example object:', matches[0]);
        break;
      }
    }
  }

  await browser.close();
}

inspectListingData();
