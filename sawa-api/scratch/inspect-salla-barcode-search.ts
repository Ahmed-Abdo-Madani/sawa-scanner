import axios from 'axios';
import * as fs from 'fs';

const stores = [
  'https://store.shonaksa.com',
  'https://yasminstore.com',
  'https://mrlogman.com',
  'https://etaamexpress.com'
];

async function inspect() {
  const barcode = '6281057030040';
  for (const store of stores) {
    console.log(`\n==================================================`);
    console.log(`STORE: ${store}`);
    const searchUrl = `${store}/ar/search?q=${barcode}`;
    
    try {
      const response = await axios.get(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
          'Referer': store,
        },
        timeout: 10000,
      });

      console.log(`HTTP Status: ${response.status}`);
      const data = response.data;
      console.log(`Data type: ${typeof data}`);
      
      if (typeof data === 'string') {
        console.log(`Data length: ${data.length}`);
        const snippet = data.substring(0, 1000);
        console.log(`Snippet:\n${snippet}`);
        
        // Write the full html to a file to search for barcode or products
        const domain = new URL(store).hostname.replace(/\./g, '_');
        const filename = `scratch/search_${domain}.html`;
        fs.writeFileSync(filename, data);
        console.log(`Saved full response to ${filename}`);
      } else {
        console.log(`Response is JSON:\n`, JSON.stringify(data).substring(0, 1000));
      }
    } catch (err: any) {
      console.error(`Error for ${store}: ${err.message}`);
    }
  }
}

inspect();
