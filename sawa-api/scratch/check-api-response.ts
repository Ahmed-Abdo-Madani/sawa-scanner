import axios from 'axios';

async function main() {
  const barcode = '6281007074995';
  
  try {
    const productUrl = `http://localhost:3000/products/${barcode}`;
    const resProduct = await axios.get(productUrl);
    console.log('==================================================');
    console.log('✅ Product Detail API response:');
    console.log('✅ Status:', resProduct.status);
    console.log('✅ Prices Count:', resProduct.data.prices?.length);
    console.log(JSON.stringify(resProduct.data.prices, null, 2));

    const pricesUrl = `http://localhost:3000/products/${barcode}/prices`;
    const resPrices = await axios.get(pricesUrl);
    console.log('==================================================');
    console.log('✅ Prices API response:');
    console.log('✅ Status:', resPrices.status);
    console.log('✅ Prices Count:', resPrices.data?.length);
    console.log(JSON.stringify(resPrices.data, null, 2));
  } catch (err: any) {
    console.error('❌ API request failed:', err.response?.data || err.message);
  }
}

main().catch(console.error);
