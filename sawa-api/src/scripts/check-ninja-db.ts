const { DataSource } = require('typeorm');
require('dotenv').config();

const ds = new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST,
  port: parseInt(process.env.DATABASE_PORT || '5432', 10),
  username: process.env.DATABASE_USERNAME,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  ssl:
    process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : true,
});

async function checkDb() {
  try {
    await ds.initialize();
    const res = await ds.query(`SELECT COUNT(*) as count FROM product`);
    console.log('product_count:', JSON.stringify(res));

    const priceRes = await ds.query(
      `SELECT COUNT(*) as count FROM product_price`,
    );
    console.log('product_price count:', JSON.stringify(priceRes));
  } catch (err) {
    console.error(err);
  } finally {
    await ds.destroy();
  }
}

checkDb();
