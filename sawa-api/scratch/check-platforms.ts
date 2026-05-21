import axios from 'axios';

const urls = [
  'https://parkcentersa.com/products?page=1',
  'https://menhal.sa/products/?page=1',
  'https://store.shonaksa.com/',
  'https://yasminstore.com/ar',
  'https://mrlogman.com/ar/?lang=ar'
];

async function checkPlatforms() {
  console.log('🔍 Checking platform signatures for target URLs...\n');

  for (const url of urls) {
    try {
      console.log(`--------------------------------------------------`);
      console.log(`Checking: ${url}`);
      
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8'
        },
        timeout: 10000,
        validateStatus: () => true
      });

      console.log(`HTTP Status: ${response.status}`);
      const headers = response.headers;
      const body = response.data || '';
      
      // Salla indicators
      const isSalla = 
        body.includes('salla.sa') || 
        body.includes('salla.co') || 
        body.includes('cdn.salla.sa') ||
        body.includes('salla-theme') ||
        JSON.stringify(headers).toLowerCase().includes('salla');

      // Shopify indicators
      const isShopify = 
        body.includes('myshopify.com') || 
        body.includes('cdn.shopify.com');

      // Ziid indicators
      const isZiid = 
        body.includes('ziid.sa') || 
        body.includes('cdn.ziid.sa') ||
        body.includes('zid.sa');

      if (isSalla) {
        console.log(`🎯 Platform Identified: SALLA (سلة)`);
      } else if (isShopify) {
        console.log(`🎯 Platform Identified: SHOPIFY`);
      } else if (isZiid) {
        console.log(`🎯 Platform Identified: ZID (زيد)`);
      } else {
        console.log(`🎯 Platform Identified: UNKNOWN / CUSTOM`);
      }

      // Check some body properties
      console.log(`HTML Title: ${body.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim() || 'N/A'}`);
      console.log(`HTML Length: ${body.length} bytes`);
      
    } catch (error: any) {
      console.error(`❌ Failed to connect to ${url}: ${error.message}`);
    }
  }
  console.log(`--------------------------------------------------`);
}

checkPlatforms();
