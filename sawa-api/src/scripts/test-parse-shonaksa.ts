import axios from 'axios';

async function testParse() {
  const url = 'https://store.shonaksa.com/ارز-بنجابي-شونة-عنبر-5-ك/p99700396';
  try {
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'ar,en;q=0.9',
      }
    });
    const html = res.data;
    console.log('HTML Length:', html.length);

    // Parse JSON-LD matches
    const ldMatches = html.match(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/gi);
    if (ldMatches) {
      console.log(`Found ${ldMatches.length} application/ld+json scripts.`);
      for (let i = 0; i < ldMatches.length; i++) {
        const text = ldMatches[i]
          .replace(/<script\s+type="application\/ld\+json">/i, '')
          .replace(/<\/script>/i, '')
          .trim();
        console.log(`--- JSON-LD Script ${i} ---`);
        try {
          const parsed = JSON.parse(text);
          console.log(JSON.stringify(parsed, null, 2).slice(0, 1500));
        } catch (e: any) {
          console.log('Parse error:', e.message);
        }
      }
    } else {
      console.log('No JSON-LD scripts found.');
    }

    // Parse meta tags
    const metaTags = [
      /meta\s+property="product:price:amount"\s+content="([^"]+)"/i,
      /meta\s+property="product:sale_price:amount"\s+content="([^"]+)"/i,
      /meta\s+property="og:image"\s+content="([^"]+)"/i,
      /meta\s+property="og:title"\s+content="([^"]+)"/i,
    ];
    console.log('--- META TAGS ---');
    for (const regex of metaTags) {
      const match = html.match(regex);
      if (match) {
        console.log(`${regex.toString()}: ${match[1]}`);
      } else {
        console.log(`${regex.toString()}: NOT FOUND`);
      }
    }

    // Search for the barcode string in HTML and show surrounding context
    const barcode = '8906131952855';
    const index = html.indexOf(barcode);
    if (index !== -1) {
      console.log(`\n🎉 Barcode ${barcode} FOUND in HTML at index ${index}!`);
      const start = Math.max(0, index - 200);
      const end = Math.min(html.length, index + 200);
      console.log('--- Context ---');
      console.log(html.substring(start, end));
    } else {
      console.log(`\n❌ Barcode ${barcode} NOT found in HTML!`);
    }
  } catch (err: any) {
    console.error('Error fetching/parsing:', err.message);
  }
}

testParse();
