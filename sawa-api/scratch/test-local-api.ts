import axios from 'axios';

async function testApi() {
  const barcode = '6281091006964';
  const url = `http://localhost:3000/products/${barcode}`;
  
  console.log(`Sending GET request to ${url}...`);
  try {
    const start = Date.now();
    const res = await axios.get(url);
    const duration = Date.now() - start;
    console.log(`Status code: ${res.status} (took ${duration}ms)`);
    console.log('Response body:', JSON.stringify(res.data, null, 2));
  } catch (err: any) {
    if (err.response) {
      console.error(`Status code: ${err.response.status}`);
      console.error('Error body:', err.response.data);
    } else {
      console.error('Error message:', err.message);
    }
  }
}

testApi();
