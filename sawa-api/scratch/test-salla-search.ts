import axios from 'axios';

const tests = [
  'https://store.shonaksa.com/ar/search?q=ميريندا',
  'https://yasminstore.com/ar/search?q=ميريندا',
  'https://mrlogman.com/ar/search?q=ميريندا'
];

async function checkSearch() {
  console.log('🔍 Testing search pages on Salla stores...\n');

  for (const url of tests) {
    try {
      console.log(`--------------------------------------------------`);
      console.log(`Searching: ${url}`);
      
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8'
        },
        timeout: 10000
      });

      console.log(`HTTP Status: ${response.status}`);
      const data = response.data;
      console.log(`Data Type: ${typeof data}`);
      
      if (typeof data === 'string') {
        const hasLdJson = data.includes('application/ld+json');
        console.log(`Contains JSON-LD: ${hasLdJson}`);
        const occurrences = (data.match(/application\/ld\+json/g) || []).length;
        console.log(`JSON-LD Occurrences: ${occurrences}`);
        if (hasLdJson) {
          const index = data.indexOf('application/ld+json');
          const snippet = data.substring(index, index + 300);
          console.log(`Snippet:\n${snippet}...`);
        }
      } else {
        console.log(`Data keys: ${Object.keys(data).slice(0, 10).join(', ')}`);
        console.log(`JSON representation snippet:\n${JSON.stringify(data).substring(0, 500)}...`);
      }
      
    } catch (error: any) {
      console.error(`❌ Failed to search on ${url}: ${error.message}`);
    }
  }
  console.log(`--------------------------------------------------`);
}

checkSearch();
