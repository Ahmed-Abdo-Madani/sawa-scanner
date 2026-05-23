const { chromium } = require('playwright');

async function run() {
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  const searchUrl = 'https://store.shonaksa.com/search?q=8906131952855';
  console.log(`Navigating to: ${searchUrl}`);
  
  await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000); // Wait 5s for client-side rendering
  
  console.log('Final URL:', page.url());
  console.log('Page Title:', await page.title());
  
  const h1Text = await page.locator('h1').first().textContent().catch(() => 'N/A');
  console.log('H1 Text:', h1Text?.trim());
  
  console.log('--- Page Body Text (first 1000 chars) ---');
  const bodyText = await page.innerText('body');
  console.log(bodyText.substring(0, 1000));
  
  console.log('--- Links on page ---');
  const links = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a'))
      .map(a => ({ text: a.textContent.trim(), href: a.href }))
      .filter(l => l.text.length > 0 && l.href.includes('/p'));
  });
  console.log(links.slice(0, 10));
  
  await browser.close();
}

run().catch(console.error);
