import { chromium } from 'playwright';
import * as fs from 'fs';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('response', async (res) => {
    const url = res.url();
    if (url.includes('graphql') || url.includes('CatalogProducts') || url.includes('MenuItems')) {
      try {
        const json = await res.json();
        fs.writeFileSync('hs-graphql-dump.json', JSON.stringify(json, null, 2));
        console.log('Saved hs-graphql-dump.json');
      } catch (e) {
        // ignore
      }
    }
  });

  await page.goto('https://hungerstation.com/sa-en/qc/65969/AL-Othaim/branch/fa269bef-9ae0-4877-ace8-272d61be145d~142939/category/Gergean-Chocolate/3833b69b-b3da-4fe3-addf-bbf0af244077');
  await page.waitForTimeout(10000);
  await browser.close();
})();
