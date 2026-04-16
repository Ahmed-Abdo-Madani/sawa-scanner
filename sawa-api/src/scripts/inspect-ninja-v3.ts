import { chromium } from 'playwright';

async function inspectNinja() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('--- Inspecting Ninja Product Page Hydration ---');

  await page.goto('https://ananinja.com/sa/en/product/zamani-cashwe-fingers-beklava-large-950-gm-19304468', { waitUntil: 'networkidle' });
  
  const hydration = await page.evaluate(() => {
    return (window as any).__next_f?.map((f: any) => f[1]).filter(Boolean) || [];
  });
  
  console.log('Hydration Data Sample:');
  console.log(JSON.stringify(hydration, null, 2).substring(0, 2000));
  
  await browser.close();
}

inspectNinja();
