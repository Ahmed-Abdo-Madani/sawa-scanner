import axios from 'axios';

async function main() {
  const API_BASE_URL = 'http://localhost:3000';
  const headers = {
    'x-dev-admin-secret': 'sawa-scanner-dev-2026',
    'Content-Type': 'application/json'
  };

  console.log('Testing GET /admin/products/filters-meta...');
  try {
    const metaRes = await axios.get(`${API_BASE_URL}/admin/products/filters-meta`, { headers });
    console.log('✅ Filters Meta Status:', metaRes.status);
    console.log('✅ Categories Count:', metaRes.data?.categories?.length);
    console.log('✅ Brands Count:', metaRes.data?.brands?.length);
    console.log('Sample categories:', metaRes.data?.categories?.slice(0, 5));
    console.log('Sample brands:', metaRes.data?.brands?.slice(0, 5));
  } catch (err: any) {
    console.error('❌ Filters Meta Failed:', err.response?.data || err.message);
  }

  console.log('\nTesting GET /admin/products/needs-gtin...');
  try {
    const needsGtinRes = await axios.get(`${API_BASE_URL}/admin/products/needs-gtin?page=1&pageSize=3`, { headers });
    console.log('✅ Needs GTIN Status:', needsGtinRes.status);
    console.log('✅ Total pending products:', needsGtinRes.data?.total);
    console.log('✅ Items returned:', needsGtinRes.data?.items?.length);
    if (needsGtinRes.data?.items && needsGtinRes.data.items.length > 0) {
      const first = needsGtinRes.data.items[0];
      console.log('Sample Product properties:');
      console.log(' - ID:', first.id);
      console.log(' - Name (EN):', first.name_en);
      console.log(' - Name (AR):', first.name_ar);
      console.log(' - Brand:', first.brand);
      console.log(' - Category:', first.category);
      console.log(' - Images count:', first.images?.length);
      console.log(' - Price count:', first.priceCount);
    }
  } catch (err: any) {
    console.error('❌ Needs GTIN Failed:', err.response?.data || err.message);
  }
}

main().catch(console.error);
