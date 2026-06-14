import { AppDataSource } from '../src/data-source';

async function main() {
  await AppDataSource.initialize();
  console.log('Database initialized.');

  // Run a raw query to fetch 5 prices with their store's district info
  const prices = await AppDataSource.query(`
    SELECT 
      pp.price_sar_incl_vat, 
      s.platform_branch_uuid, 
      s.district_name_en, 
      s.district_name_ar
    FROM product_price pp
    INNER JOIN store s ON s.id = pp.store_id
    LIMIT 5
  `);

  console.log('Prices with store and district details:');
  console.log(JSON.stringify(prices, null, 2));

  await AppDataSource.destroy();
}

main().catch(err => console.error(err));
