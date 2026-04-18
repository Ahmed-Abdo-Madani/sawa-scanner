import { chromium } from 'playwright';
import * as fs from 'fs';

async function run() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('Navigating to product page...');
  await page.goto('https://ananinja.com/sa/en/product/19289885', {
    waitUntil: 'networkidle',
  });
  await page.waitForTimeout(5000);

  const scripts = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('script'))
      .map((s) => s.textContent)
      .filter((t) => t?.includes('self.__next_f.push'));
  });

  fs.writeFileSync('product-19289885-dump.txt', scripts.join('\n---\n'));
  console.log('Dumped self.__next_f content to product-19289885-dump.txt');

  await browser.close();
}

run();
