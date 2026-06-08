const axios = require('axios');

async function test() {
  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  
  const itemId = 10008;
  const url1 = `https://mubarkiyah.com/item/${itemId}`;
  const url2 = `https://mubarkiyah.com/item/${itemId}/كوسه القصيم`;
  const url3 = `https://mubarkiyah.com/item/${itemId}/كوسه القصيم&2`;
  
  for (const url of [url1, url2, url3]) {
    try {
      console.log(`Fetching: ${url}`);
      const res = await axios.get(encodeURI(url), {
        headers: { 'User-Agent': ua },
        timeout: 10000
      });
      console.log(`-> Status: ${res.status}`);
      const html = res.data;
      const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
      console.log(`-> Next.js hydration found: ${!!match}`);
    } catch (err) {
      console.error(`-> Error: ${err.message}`);
    }
  }
}

test();
