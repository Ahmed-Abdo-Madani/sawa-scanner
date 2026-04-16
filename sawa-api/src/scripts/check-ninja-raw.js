const { Client } = require('pg');
require('dotenv').config();

async function checkDb() {
  const client = new Client({
    host: process.env.DATABASE_HOST,
    port: parseInt(process.env.DATABASE_PORT || '5432'),
    user: process.env.DATABASE_USERNAME,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
    ssl: { rejectUnauthorized: false }
  });

  console.log('🔍 Checking database for Ninja products (Raw SQL)...');
  try {
    await client.connect();
    
    const merchantRes = await client.query("SELECT id, name_en FROM merchant WHERE name_en ILIKE '%ninja%' LIMIT 1");
    if (merchantRes.rows.length === 0) {
      console.error('❌ Ninja merchant not found.');
      await client.end();
      return;
    }

    const merchantId = merchantRes.rows[0].id;
    console.log(`✅ Found Ninja merchant ID: ${merchantId}`);

    const countRes = await client.query('SELECT COUNT(*) FROM product_price WHERE merchant_id = $1', [merchantId]);
    console.log(`📊 Ingested Ninja Product Prices: ${countRes.rows[0].count}`);

    if (parseInt(countRes.rows[0].count) > 0) {
      const sampleRes = await client.query(`
        SELECT pp.price, pp.in_stock, pp.product_page_url, p.name_en
        FROM product_price pp
        JOIN product p ON pp.product_id = p.id
        WHERE pp.merchant_id = $1
        ORDER BY pp.created_at DESC
        LIMIT 5
      `, [merchantId]);

      console.log('\n✨ Recent Sample Products:');
      console.table(sampleRes.rows);
    } else {
      console.log('⚠️ No products found for Ninja yet.');
    }

    await client.end();
  } catch (err) {
    console.error('❌ DB Error:', err.message);
    process.exit(1);
  }
}

checkDb();
