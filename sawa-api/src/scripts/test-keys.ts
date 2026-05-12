import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const url = 'https://hungerstation.com/sa-en/qc/65969/AL-Othaim/branch/fa269bef-9ae0-4877-ace8-272d61be145d~142939/category/Gergean-Chocolate/3833b69b-b3da-4fe3-addf-bbf0af244077';
  await page.goto(url);
  await page.waitForTimeout(5000);

  const domProducts = await page.evaluate(() => {
    return Array.from(
      document.querySelectorAll<HTMLAnchorElement>(
        'a[href*="/items/"], a[href*="/item/"], a[href*="/product/"]',
      ),
    ).map((el) => {
      const href = el.getAttribute('href') || el.href || '';
      const title =
        el.querySelector('h1,h2,h3,[class*="name"],[class*="title"]')?.textContent?.trim() ||
        el.textContent?.trim() ||
        '';
      return { href, title };
    });
  });

  for (const item of domProducts) {
    const slugMatch = item.href.match(/\/product\/([^/]+)\//);
    const keyFromHref = slugMatch ? slugMatch[1].toLowerCase() : null;
    const keyFromTitle = encodeURIComponent(item.title.toLowerCase().replace(/\s+/g, '-'));
    console.log(`Href key:  ${keyFromHref}`);
    console.log(`Title key: ${keyFromTitle}`);
    console.log(`Equal?     ${keyFromHref === keyFromTitle}`);
    console.log('---');
  }

  await browser.close();
})();
