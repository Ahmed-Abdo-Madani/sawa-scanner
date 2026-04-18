import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as fs from 'fs';
import path from 'path';

chromium.use(StealthPlugin());

async function debugNinja() {
  const scratchDir =
    'C:/Users/Design_Bench_12/.gemini/antigravity/brain/910d92a9-7e36-45e5-9843-af2749d98c2a/scratch';
  const url = 'https://ananinja.com/sa/en/category/sweets-snacks-3';

  console.log(`Launching browser for ${url}...`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  const requests: any[] = [];
  page.on('request', (req) => {
    requests.push({
      url: req.url(),
      method: req.method(),
      headers: req.headers(),
    });
  });

  page.on('response', async (res) => {
    if (res.url().includes('graphql') || res.url().includes('api')) {
      console.log(`RESPONSE: ${res.url()} (${res.status()})`);
      try {
        const body = await res.text();
        fs.writeFileSync(
          path.join(scratchDir, `res-${Date.now()}.json`),
          JSON.stringify({
            url: res.url(),
            status: res.status(),
            body: body.substring(0, 1000),
          }),
        );
      } catch (e) {}
    }
  });

  try {
    console.log('Navigating...');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    console.log('Navigation done. Waiting for network idle or timeout...');

    await page.waitForTimeout(10000);

    const content = await page.content();
    fs.writeFileSync(path.join(scratchDir, 'ninja-debug.html'), content);
    await page.screenshot({
      path: path.join(scratchDir, 'ninja-debug.png'),
      fullPage: true,
    });

    console.log('Saved debug artifacts.');
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await browser.close();
  }
}

debugNinja();
