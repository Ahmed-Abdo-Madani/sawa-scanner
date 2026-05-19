import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  console.log('Navigating to Organic Products...');
  await page.goto('https://hungerstation.com/sa-en/qc/65969/AL-Othaim/branch/fa269bef-9ae0-4877-ace8-272d61be145d~142939/category/Organic-Products/1bc831b5-6e97-402d-8c6a-6633f7f75377', { waitUntil: 'networkidle' });
  await page.waitForTimeout(5000);
  
  const text = await page.evaluate(() => document.body.innerText);
  console.log('Page Text contains "Organic Foods":', text.includes('Organic Foods'));
  console.log('Page Text contains "Organic Drinks":', text.includes('Organic Drinks'));

  // Get all section titles
  const headings = await page.$$eval('h2, h3', els => els.map(e => e.textContent));
  console.log('Headings:', headings);

  await browser.close();
})();
