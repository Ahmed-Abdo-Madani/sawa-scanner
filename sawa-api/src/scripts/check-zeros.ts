import { Client } from 'pg';
import { config } from 'dotenv';
config();

const client = new Client({
  host: process.env.DATABASE_HOST,
  port: parseInt(process.env.DATABASE_PORT || '5432'),
  user: process.env.DATABASE_USERNAME,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false
});

client.connect().then(async () => {
  const res = await client.query(`
    select p.name_en, p.gtin, pr.price_sar_incl_vat 
    from product p 
    join product_price pr on p.id = pr.product_id 
    where pr.price_sar_incl_vat = 0 
    limit 10
  `);
  console.table(res.rows);
  client.end();
});
