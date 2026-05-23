const { chromium } = require('playwright');

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const searchUrl = 'https://store.shonaksa.com/search?q=8906131952855';
  await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  
  const outerHtmls = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a[href*="/p"]'))
      .map(a => {
        let parent = a.parentElement;
        const parentChain = [];
        while (parent && parent.tagName !== 'BODY') {
          parentChain.push(parent.tagName + (parent.className ? '.' + parent.className.split(/\s+/).join('.') : ''));
          parent = parent.parentElement;
        }
        return {
          text: a.textContent.trim(),
          href: a.href,
          html: a.outerHTML,
          parents: parentChain.slice(0, 5).join(' -> ')
        };
      });
  });
  console.log(JSON.stringify(outerHtmls, null, 2));
  await browser.close();
}

run().catch(console.error);
