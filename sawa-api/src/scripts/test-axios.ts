import axios from 'axios';

async function test() {
  try {
    console.log('Fetching sweets-snacks...');
    const res = await axios.get('https://ananinja.com/sa/en/category/sweets-snacks-3', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      }
    });

    const products = res.data.match(/\{"isAvailable":.+?,"productId":".+?","name":".+?".+?\}/g);
    console.log('Found product segments directly in regex:', products ? products.length : 0);
    
    if (!products) {
      const allProductIds = res.data.match(/"productId"/g);
      console.log('Total "productId" strings found:', allProductIds?.length || 0);
    }
  } catch (err) {
    console.error('Error fetching HTML:', err.message);
  }
}

test();
