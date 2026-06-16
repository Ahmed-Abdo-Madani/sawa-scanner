import { Client } from 'pg';
import { config } from 'dotenv';

config();

async function run() {
  console.log('🚀 Starting Catalog Database Cloning (Production -> Local)');
  
  const localConfig = {
    host: process.env.DATABASE_HOST,
    port: parseInt(process.env.DATABASE_PORT || '5432'),
    user: process.env.DATABASE_USERNAME,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  };

  const prodConfig = {
    host: process.env.PROD_DATABASE_HOST,
    port: parseInt(process.env.PROD_DATABASE_PORT || '5432'),
    user: process.env.PROD_DATABASE_USERNAME,
    password: process.env.PROD_DATABASE_PASSWORD,
    database: process.env.PROD_DATABASE_NAME,
    ssl: process.env.PROD_DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  };

  const clientLocal = new Client(localConfig);
  const clientProd = new Client(prodConfig);

  const startTime = Date.now();

  try {
    await clientLocal.connect();
    console.log('🔌 Connected to Local Database.');
    
    await clientProd.connect();
    console.log('🔌 Connected to Production Database.');

    // 1. Truncate all local catalog tables to avoid conflicts
    console.log('\n🧹 Truncating local catalog tables...');
    await clientLocal.query(`
      TRUNCATE TABLE 
        product_price, 
        product_alternative_name, 
        product_image, 
        product_allergen, 
        ingredient, 
        nutrition_fact, 
        product, 
        store, 
        merchant 
      CASCADE;
    `);
    console.log('✅ Local catalog tables truncated successfully.');

    // 2. Define tables in order of dependency
    const tables = [
      'merchant',
      'store',
      'product',
      'nutrition_fact',
      'ingredient',
      'product_allergen',
      'product_image',
      'product_alternative_name',
      'product_price'
    ];

    for (const table of tables) {
      console.log(`\n📋 Cloning table: ${table}`);
      
      // Get column names
      const colsRes = await clientProd.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public'`,
        [table]
      );
      const columns = colsRes.rows.map(r => r.column_name);
      const colsString = columns.map(c => `"${c}"`).join(', ');

      console.log(`Found columns: ${columns.join(', ')}`);

      const maxParams = 60000;
      const chunkSize = Math.max(100, Math.floor(maxParams / columns.length));
      console.log(`Calculated safe chunk size: ${chunkSize}`);

      // Count total rows
      const countRes = await clientProd.query(`SELECT COUNT(*)::int as count FROM "${table}"`);
      const totalRows = countRes.rows[0].count;
      console.log(`Total rows in Production: ${totalRows}`);

      if (totalRows === 0) {
        console.log(`No rows to clone for ${table}.`);
        continue;
      }

      let lastId: string | null = null;
      let clonedCount = 0;

      while (true) {
        // Fetch chunk from production using keyset pagination (immune to offsets shifting)
        let queryStr = `SELECT * FROM "${table}" ORDER BY id LIMIT $1`;
        let queryParams: any[] = [chunkSize];
        if (lastId) {
          queryStr = `SELECT * FROM "${table}" WHERE id > $2 ORDER BY id LIMIT $1`;
          queryParams = [chunkSize, lastId];
        }
        const prodDataRes = await clientProd.query(queryStr, queryParams);
        
        const rows = prodDataRes.rows;
        if (rows.length === 0) break;

        // Build chunk insert query
        const valueRows: string[] = [];
        const params: any[] = [];
        let paramIdx = 1;

        for (const row of rows) {
          const rowPlaceholders: string[] = [];
          for (const col of columns) {
            rowPlaceholders.push(`$${paramIdx++}`);
            params.push(row[col]);
          }
          valueRows.push(`(${rowPlaceholders.join(', ')})`);
        }

        const insertQuery = `INSERT INTO "${table}" (${colsString}) VALUES ${valueRows.join(', ')} ON CONFLICT (id) DO NOTHING`;
        await clientLocal.query(insertQuery, params);

        clonedCount += rows.length;
        lastId = rows[rows.length - 1].id;
        
        const percentage = ((clonedCount / totalRows) * 100).toFixed(1);
        console.log(`  Progress: ${clonedCount}/${totalRows} (${percentage}%)`);
      }

      console.log(`✅ Finished cloning table: ${table}`);
    }

    const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n🎉 Database cloning successfully finished in ${elapsedSeconds} seconds!`);
  } catch (error) {
    console.error('\n❌ Database cloning failed:', error);
  } finally {
    await clientLocal.end();
    await clientProd.end();
    console.log('🔌 Connections closed.');
  }
}

run();
