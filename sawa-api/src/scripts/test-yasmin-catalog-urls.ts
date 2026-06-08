import axios from 'axios';

async function testUrls() {
  const urls = [
    'https://yasminstore.com/products',
    'https://yasminstore.com/en/products',
    'https://yasminstore.com',
  ];

  for (const url of urls) {
    console.log(`🌐 Hitting URL: ${url}`);
    try {
      const res = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        },
        timeout: 10000,
      });
      console.log(`✅ Success. Status: ${res.status}. Content Length: ${res.data.length}`);
      
      // If it is the home page, let's parse and print some categories
      if (url === 'https://yasminstore.com') {
        const categories = new Set<string>();
        const matches = res.data.match(/href="([^"]*\/c\d+)"/g);
        if (matches) {
          for (const m of matches) {
            const cleanUrl = m.replace('href="', '').replace('"', '');
            categories.add(cleanUrl.startsWith('http') ? cleanUrl : `https://yasminstore.com${cleanUrl}`);
          }
          console.log(`📂 Found ${categories.size} category links:`);
          console.log(Array.from(categories).slice(0, 15));
        } else {
          console.log('❌ No category links found containing /c\\d+');
        }
      }
    } catch (e: any) {
      console.log(`❌ Failed: ${e.message}`);
    }
  }
}

testUrls();
