import axios from 'axios';
import * as fs from 'fs';

async function run() {
  const url = 'https://store.shonaksa.com/ar/search?q=%D9%86%D8%A7%D8%AF%D9%83'; // "نادك" encoded
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

  const html = response.data;
  fs.writeFileSync('nadec-search.html', html);
  
  // Let's print out all links containing /p/
  const pLinks = html.match(/\/p\/[^\s"'>]+/g);
  console.log(`Found ${pLinks ? pLinks.length : 0} product URLs (/p/...)`);
  if (pLinks) {
    console.log('Product URLs:', Array.from(new Set(pLinks)).slice(0, 10));
  }

  // Let's find any images with class or containing /products/
  const productImgs = html.match(/https:\/\/cdn\.salla\.sa\/[^\s"'>]+/g);
  console.log(`Found ${productImgs ? productImgs.length : 0} Salla CDN URLs`);
  if (productImgs) {
    console.log('CDN URLs:', Array.from(new Set(productImgs)).slice(0, 10));
  }
}

run().catch(console.error);
