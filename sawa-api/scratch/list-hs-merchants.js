const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load .env
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envConfig = dotenv.parse(fs.readFileSync(envPath));
  for (const k in envConfig) {
    process.env[k] = envConfig[k];
  }
}

async function main() {
  const client = new Client({
    host: process.env.DATABASE_HOST,
    port: parseInt(process.env.DATABASE_PORT || '5432'),
    database: process.env.DATABASE_NAME,
    user: process.env.DATABASE_USERNAME,
    password: process.env.DATABASE_PASSWORD,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });

  await client.connect();
  console.log('Connected to DB.');

  const res = await client.query(`
    SELECT m.name_en, m.name_ar, COUNT(s.id) as store_count 
    FROM store s 
    JOIN merchant m ON s.merchant_id = m.id 
    WHERE s.platform = 'hungerstation' 
    GROUP BY m.name_en, m.name_ar
    ORDER BY store_count DESC
  `);
  
  let out = 'HungerStation Merchants count: ' + res.rows.length + '\nTop Merchants:\n';
  res.rows.slice(0, 100).forEach((row, i) => {
    out += `${i+1}. name_en: "${row.name_en}", name_ar: "${row.name_ar}", store_count: ${row.store_count}\n`;
  });
  fs.writeFileSync(path.join(__dirname, 'hs-merchants-output.txt'), out);
  console.log('Saved to scratch/hs-merchants-output.txt');

  await client.end();
}

main().catch(err => console.error(err));
