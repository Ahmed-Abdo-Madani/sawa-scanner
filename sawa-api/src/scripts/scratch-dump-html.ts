import axios from 'axios';
import * as fs from 'fs';

async function dump() {
  try {
    const url = 'https://store.shonaksa.com/ar/search?q=6281057030040';
    console.log(`Fetching ${url}`);
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
        'Referer': 'https://store.shonaksa.com',
      },
      timeout: 10000,
    });

    console.log(`Status: ${response.status}`);
    console.log(`HTML Length: ${response.data.length}`);
    fs.writeFileSync('salla-search.html', response.data);
    console.log('Saved to salla-search.html');

    // Also look for keywords in the html
    const hasProduct = response.data.includes('product') || response.data.includes('منتج') || response.data.includes('نتائج');
    console.log(`Contains 'product'/'منتج'/'نتائج'?: ${hasProduct}`);
    
    // Print first 500 chars
    console.log('First 500 chars of HTML:');
    console.log(response.data.slice(0, 500));
  } catch (err: any) {
    console.error('Error:', err.message);
    if (err.response) {
      console.log('Status code:', err.response.status);
      console.log('Headers:', err.response.headers);
    }
  }
}

dump();
