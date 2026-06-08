const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  const url = 'https://hungerstation.com/sa-en/qc/6082/Wooden-Bakery/branch/riyadh~yasmin~13744';
  console.log(`Navigating to ${url}...`);
  
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);

    // 1. Print all anchor tags on the page
    const anchors = await page.evaluate(() => {
      const elList = Array.from(document.querySelectorAll('a'));
      return elList.map(a => ({
        text: a.textContent?.trim() || '',
        href: a.getAttribute('href') || '',
        class: a.getAttribute('class') || '',
        dataTestId: a.getAttribute('data-testid') || ''
      })).filter(x => x.text || x.href);
    });

    console.log(`Total anchors found on the page: ${anchors.length}`);
    console.log('--- First 40 anchors ---');
    console.log(JSON.stringify(anchors.slice(0, 40), null, 2));

    console.log('--- Anchors with "category" or "cat" in href or class ---');
    const categoryAnchors = anchors.filter(a => a.href.includes('category') || a.href.includes('/cat/') || a.class.includes('category'));
    console.log(JSON.stringify(categoryAnchors, null, 2));

    // 2. Check if __NEXT_DATA__ is on the page
    const nextData = await page.evaluate(() => {
      const script = document.getElementById('__NEXT_DATA__');
      return script ? script.textContent.substring(0, 1000) : null;
    });
    console.log(`\n__NEXT_DATA__ exists: ${!!nextData}`);
    if (nextData) {
      console.log(`__NEXT_DATA__ sample:\n${nextData}`);
    }

  } catch (err) {
    console.error('Error during inspection:', err);
  } finally {
    await browser.close();
  }
}

main();
