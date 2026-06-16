import { Client } from 'pg';
import { config } from 'dotenv';

config();

async function run() {
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

  try {
    await clientLocal.connect();
    await clientProd.connect();
    console.log('🔌 Connected to both databases.');

    // Fetch mappings
    const localRes = await clientLocal.query('SELECT id, hs_product_id FROM product WHERE hs_product_id IS NOT NULL');
    const localMap = new Map<string, string>(localRes.rows.map(r => [r.hs_product_id, r.id]));

    const prodRes = await clientProd.query('SELECT id, hs_product_id FROM product WHERE hs_product_id IS NOT NULL');
    const prodMap = new Map<string, string>(prodRes.rows.map(r => [r.hs_product_id, r.id]));

    const conflicts: { localId: string; prodId: string }[] = [];
    for (const [hsId, localId] of localMap.entries()) {
      if (prodMap.has(hsId)) {
        const prodId = prodMap.get(hsId)!;
        if (localId !== prodId) {
          conflicts.push({ localId, prodId });
        }
      }
    }

    console.log(`Found ${conflicts.length} conflicting UUIDs.`);
    if (conflicts.length === 0) {
      console.log('No conflicts found. Nothing to resolve.');
      return;
    }

    console.log('⚡ Disabling triggers on local database tables...');
    const tables = [
      'product_price',
      'product_image',
      'product_allergen',
      'nutrition_fact',
      'ingredient',
      'product_alternative_name',
      'product'
    ];

    for (const table of tables) {
      await clientLocal.query(`ALTER TABLE "${table}" DISABLE TRIGGER ALL`);
    }

    console.log('📝 Updating local product UUIDs to match production...');
    await clientLocal.query('BEGIN');

    let count = 0;
    for (const c of conflicts) {
      // Update foreign keys and primary keys
      await clientLocal.query('UPDATE product SET id = $1 WHERE id = $2', [c.prodId, c.localId]);
      await clientLocal.query('UPDATE product_price SET product_id = $1 WHERE product_id = $2', [c.prodId, c.localId]);
      await clientLocal.query('UPDATE product_image SET product_id = $1 WHERE product_id = $2', [c.prodId, c.localId]);
      await clientLocal.query('UPDATE product_allergen SET product_id = $1 WHERE product_id = $2', [c.prodId, c.localId]);
      await clientLocal.query('UPDATE nutrition_fact SET product_id = $1 WHERE product_id = $2', [c.prodId, c.localId]);
      await clientLocal.query('UPDATE ingredient SET product_id = $1 WHERE product_id = $2', [c.prodId, c.localId]);
      await clientLocal.query('UPDATE product_alternative_name SET product_id = $1 WHERE product_id = $2', [c.prodId, c.localId]);
      
      count++;
      if (count % 500 === 0) {
        console.log(`Processed ${count}/${conflicts.length} merges...`);
      }
    }

    await clientLocal.query('COMMIT');
    console.log(`✅ Successfully updated ${conflicts.length} conflicting UUIDs in the local database.`);

  } catch (err: any) {
    console.error('❌ Error during resolution:', err.message);
    try {
      await clientLocal.query('ROLLBACK');
    } catch (rbErr) {}
  } finally {
    console.log('⚡ Re-enabling triggers on local database tables...');
    const tables = [
      'product_price',
      'product_image',
      'product_allergen',
      'nutrition_fact',
      'ingredient',
      'product_alternative_name',
      'product'
    ];
    for (const table of tables) {
      try {
        await clientLocal.query(`ALTER TABLE "${table}" ENABLE TRIGGER ALL`);
      } catch (err) {}
    }

    await clientLocal.end();
    await clientProd.end();
  }
}

run().catch(console.error);
