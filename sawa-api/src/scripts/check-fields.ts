import { chromium } from 'playwright';
import * as fs from 'fs';

async function run() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('https://ananinja.com/sa/en/product/19304137');
  await page.waitForTimeout(3000);
  const content = await page.content();
  fs.writeFileSync('ninja-dom.txt', content);
  await browser.close();
}
run();
