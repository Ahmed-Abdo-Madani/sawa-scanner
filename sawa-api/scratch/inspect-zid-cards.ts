import { chromium } from 'playwright';

const url = 'https://menhal.sa/products?q=%D8%B4%D8%A7%D9%8A'; // 'شاي'

async function inspectZidCards() {
  console.log('🔍 Inspecting Zid product cards DOM structure...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8'
    });

    console.log(`Navigating to: ${url}`);
    await page.goto(url, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(3000);

    const cardsDetails = await page.evaluate(() => {
      // Find elements that could be cards
      const selectors = [
        '.product-card',
        '.product-item',
        '[class*="product-card"]',
        '[class*="product-item"]',
        '[class*="product_card"]',
        '[class*="product_item"]'
      ];
      
      let matchedSelector = '';
      let cards: Element[] = [];

      for (const sel of selectors) {
        const found = Array.from(document.querySelectorAll(sel));
        if (found.length > 0) {
          matchedSelector = sel;
          cards = found;
          break;
        }
      }

      if (cards.length === 0) return { error: 'No product card selector matched.' };

      // Map the first 5 cards to see their inner HTML structure
      const sampleCards = cards.slice(0, 5).map((card, idx) => {
        // Find links
        const links = Array.from(card.querySelectorAll('a')).map(a => ({
          href: a.href,
          text: a.textContent?.trim() || '',
          class: a.className
        }));

        // Find images
        const imgs = Array.from(card.querySelectorAll('img')).map(i => ({
          src: i.src || i.getAttribute('data-src') || '',
          alt: i.alt || '',
          class: i.className
        }));

        // Find text elements
        const headings = Array.from(card.querySelectorAll('h1, h2, h3, h4, h5, h6, span, div, p'))
          .filter(el => el.textContent?.trim().length && el.textContent.trim().length < 100)
          .map(el => ({
            tag: el.tagName,
            class: el.className,
            text: el.textContent?.trim() || ''
          }));

        return {
          cardIndex: idx + 1,
          tagName: card.tagName,
          className: card.className,
          outerHTMLSnippet: card.outerHTML.substring(0, 1000),
          links,
          imgs,
          headings
        };
      });

      return { matchedSelector, count: cards.length, sampleCards };
    });

    console.log('Selector matched:', cardsDetails.matchedSelector);
    console.log('Cards count:', cardsDetails.count);
    if (cardsDetails.sampleCards) {
      console.log('Sample Card 1 Structure:');
      console.log(JSON.stringify(cardsDetails.sampleCards[0], null, 2));
    } else {
      console.log(cardsDetails.error);
    }

  } catch (e: any) {
    console.error(`❌ Error: ${e.message}`);
  } finally {
    await browser.close();
  }
}

inspectZidCards();
