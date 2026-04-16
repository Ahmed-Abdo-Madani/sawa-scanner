import { chromium } from 'playwright';
import * as fs from 'fs';

async function test() {
  console.log('Launching playwright...');
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  page.on('response', async res => {
    try {
      const type = res.request().resourceType();
      if (type === 'fetch' || type === 'xhr') {
        const url = res.url();
        console.log(`FETCH: ${url}`);
        fs.appendFileSync('C:/Users/Design_Bench_12/.gemini/antigravity/brain/910d92a9-7e36-45e5-9843-af2749d98c2a/scratch/ninja-fetches.log', url + '\n');
      }
    } catch (e) {}
  });

  console.log('Navigating...');
  try {
    await page.goto('https://ananinja.com/sa/en/category/fruits-and-vegetables-1011', { waitUntil: 'load', timeout: 45000 });
    console.log('Load navigation finished, waiting 10 seconds...');
    await page.waitForTimeout(10000);
    
    await page.mouse.wheel(0, 1000);
    await page.waitForTimeout(2000);
  } catch (e) {
    console.error('Navigation error:', e.message);
  }
  
  await browser.close();
}

test();
