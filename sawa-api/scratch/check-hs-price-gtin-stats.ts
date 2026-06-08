import { AppDataSource } from '../src/data-source';

async function main() {
  await AppDataSource.initialize();
  console.log('Database connected.');

  // 1. Total HungerStation prices
  const totalHsPrices = await AppDataSource.query(`
    SELECT COUNT(*) AS total_prices
    FROM product_price pp
    JOIN store s ON pp.store_id = s.id
    WHERE s.platform = 'hungerstation';
  `);
  console.log('\n--- Total HungerStation Prices ---');
  console.table(totalHsPrices);

  // 2. HungerStation prices linked to products with GTINs
  const hsPricesWithGtin = await AppDataSource.query(`
    SELECT COUNT(*) AS prices_with_gtin
    FROM product_price pp
    JOIN store s ON pp.store_id = s.id
    JOIN product p ON pp.product_id = p.id
    WHERE s.platform = 'hungerstation' AND p.gtin IS NOT NULL;
  `);
  console.log('\n--- HungerStation Prices Linked to Products with GTINs ---');
  console.table(hsPricesWithGtin);

  // 3. HungerStation prices linked to products without GTINs
  const hsPricesWithoutGtin = await AppDataSource.query(`
    SELECT COUNT(*) AS prices_without_gtin
    FROM product_price pp
    JOIN store s ON pp.store_id = s.id
    JOIN product p ON pp.product_id = p.id
    WHERE s.platform = 'hungerstation' AND p.gtin IS NULL;
  `);
  console.log('\n--- HungerStation Prices Linked to Products WITHOUT GTINs ---');
  console.table(hsPricesWithoutGtin);

  // 4. Group prices with GTIN by the product's data_source
  const hsPricesByProductSource = await AppDataSource.query(`
    SELECT
      p.data_source AS product_data_source,
      COUNT(pp.id) AS total_prices
    FROM product_price pp
    JOIN store s ON pp.store_id = s.id
    JOIN product p ON pp.product_id = p.id
    WHERE s.platform = 'hungerstation'
    GROUP BY p.data_source
    ORDER BY total_prices DESC;
  `);
  console.log('\n--- HungerStation Prices grouped by Linked Product data_source ---');
  console.table(hsPricesByProductSource);

  await AppDataSource.destroy();
}

main().catch(console.error);
