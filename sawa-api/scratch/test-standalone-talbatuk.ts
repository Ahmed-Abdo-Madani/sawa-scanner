import { chromium } from 'playwright';

async function run() {
  const barcode = '776992032113';
  console.log(`🔎 Standalone validation for Talbatuk search for barcode "${barcode}"...`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    const url = `https://talbatuk.com/products?q=${barcode}`;
    console.log(`Navigating to: ${url}...`);

    await page.goto(url, { waitUntil: 'domcontentloaded' });
    console.log('Navigation finished. Waiting 3 seconds...');
    await page.waitForTimeout(3000);

    const searchResults = await page.evaluate(() => {
      function isGenericButtonOrLabel(name: string): boolean {
        if (!name) return true;
        const clean = name.trim().replace(/\s+/g, ' ').toLowerCase();
        const blacklisted = [
          'اضف الى السلة', 'أضف إلى السلة', 'اضف للسلة', 'أضف للسلة',
          'اضافة للسلة', 'إضافة للسلة', 'اضافة الى السلة', 'إضافة إلى السلة',
          'اشتر الآن', 'اشتري الآن', 'شراء الآن', 'نفدت الكمية', 'نفذت الكمية',
          'غير متوفر', 'تفاصيل المنتج', 'عرض المنتج', 'قراءة المزيد', 'تفاصيل',
          'المزيد', 'سلة المشتريات', 'أضف للمقارنة', 'أضف للمفضلة', 'معاينة', 'سريع',
          'أعلمني عند التوفر', 'اعلمني عند التوفر', 'أعلمني عند توفره', 'اعلمني عند توفره',
          'أعلمني عند توفر المنتج', 'اعلمني عند توفر المنتج', 'إعلامي عند التوفر', 'اعلامي عند التوفر',
          'add to cart', 'add to basket', 'buy now', 'out of stock', 'sold out',
          'read more', 'details', 'view product', 'quick view', 'add to wishlist',
          'add to compare', 'go to cart', 'notify me', 'notify me when available'
        ];
        return clean.length <= 2 || blacklisted.some(term => clean === term);
      }

      function isValidZidProductUrl(url: string): boolean {
        if (!url) return false;
        try {
          const parsed = new URL(url, window.location.href);
          if (parsed.host !== window.location.host) {
            return false;
          }
          const lower = parsed.pathname.toLowerCase();
          if (!lower.includes('/products/')) {
            return false;
          }
          return true;
        } catch {
          return false;
        }
      }

      const results: { name: string; url: string; image: string | null }[] = [];
      
      const grid = document.getElementById('products-list') || document.querySelector('.products-list, .product-grid');
      const root = grid || document;
      const cards = root.querySelectorAll('.product-item, .product-card, [class*="product-card"], [class*="product-item"], product-card, product-item, .product-cart-wrap');

      for (const card of Array.from(cards)) {
        if (card.tagName.toLowerCase() === 'product-card') {
          const productAttr = card.getAttribute('product');
          if (productAttr) {
            try {
              const productObj = JSON.parse(productAttr);
              if (productObj && productObj.name && productObj.slug) {
                const productUrl = `${window.location.origin}/products/${productObj.slug}`;
                let imgUrl = null;
                if (productObj.images && productObj.images.length > 0) {
                  imgUrl = productObj.images[0]?.image?.large || productObj.images[0]?.image?.small || productObj.images[0]?.image?.full_size || null;
                }
                if (isValidZidProductUrl(productUrl) && !isGenericButtonOrLabel(productObj.name)) {
                  if (!results.some(r => r.url === productUrl)) {
                    results.push({
                      name: productObj.name,
                      url: productUrl,
                      image: imgUrl,
                    });
                  }
                  continue;
                }
              }
            } catch (e) {
              // fallback
            }
          }
        }

        const anchors = Array.from(card.querySelectorAll('a'));
        let linkEl: HTMLAnchorElement | null = null;
        let url = '';
        for (const a of anchors) {
          if (a.href && isValidZidProductUrl(a.href)) {
            linkEl = a;
            url = a.href;
            break;
          }
        }
        if (!linkEl) continue;
        
        let image: string | null = null;
        const imgs = card.querySelectorAll('img');
        for (const img of Array.from(imgs)) {
          const rawSrc = img.getAttribute('src');
          const dataSrc = img.getAttribute('data-src');
          const src = (rawSrc && rawSrc !== '#' && rawSrc !== '') ? rawSrc : dataSrc;
          if (src && !src.includes('spinner') && !src.includes('placeholder') && !src.includes('.gif')) {
            image = src.startsWith('http') ? src : new URL(src, window.location.href).href;
            break;
          }
        }

        const titleEl = card.querySelector('.product-title, .title, h1, h2, h3, h4, h5, h6, span.product-name, [class*="title"]');
        let name = titleEl?.textContent?.trim() || '';

        if (!name) {
          for (const a of anchors) {
            const text = a.textContent?.trim();
            if (text && !isGenericButtonOrLabel(text)) {
              name = text;
              break;
            }
          }
        }

        if (name && url && !isGenericButtonOrLabel(name)) {
          if (!results.some(r => r.url === url)) {
            results.push({ name, url, image });
          }
        }
      }
      return results;
    });

    console.log(`\n🎉 Extracted ${searchResults.length} candidates from Talbatuk:`);
    console.log(searchResults);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await browser.close();
    console.log('\n👋 Finished.');
  }
}

run();
