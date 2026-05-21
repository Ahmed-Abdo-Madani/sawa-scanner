async function run() {
  const secret = 'sawa-scanner-dev-2026';
  const headers = {
    'x-dev-admin-secret': secret,
  };

  console.log('Testing /admin/products/needs-gtin?page=1&pageSize=2...');
  try {
    const res = await fetch('http://localhost:3000/admin/products/needs-gtin?page=1&pageSize=2', { headers });
    console.log('Status:', res.status);
    const body = await res.json();
    console.log('Body:', JSON.stringify(body, null, 2).slice(0, 1000));
  } catch (err) {
    console.error('Error fetching needs-gtin:', err);
  }

  console.log('\nTesting /admin/products?missingGtin=true&page=1&pageSize=2...');
  try {
    const res = await fetch('http://localhost:3000/admin/products?missingGtin=true&page=1&pageSize=2', { headers });
    console.log('Status:', res.status);
    const body = await res.json();
    console.log('Body:', JSON.stringify(body, null, 2).slice(0, 1000));
  } catch (err) {
    console.error('Error fetching missing-gtin:', err);
  }
}

run();
