import { AppDataSource } from '../src/data-source';
import { Product } from '../src/entities/product.entity';
import { normalizeBrandStrict, normalizeBrandUsable, inferBrandAndWeightFromName } from '../src/utils/normalization';
import { IsNull, Not } from 'typeorm';

async function main() {
  await AppDataSource.initialize();
  console.log('Database connected.');

  const productRepo = AppDataSource.getRepository(Product);

  const hsProducts = await productRepo.find({
    where: {
      gtin: IsNull(),
      hs_product_id: Not(IsNull()),
    },
    take: 20,
  });

  console.log(`\nFound ${hsProducts.length} HS products without GTINs.`);
  console.log('------------------------------------------------------------');

  for (const p of hsProducts) {
    const brandUsable = normalizeBrandUsable(p.brand);
    const brandStrict = normalizeBrandStrict(p.brand);
    console.log(`Product ID: ${p.id}`);
    console.log(`  Name (EN): ${p.name_en}`);
    console.log(`  Name (AR): ${p.name_ar}`);
    console.log(`  Brand:     ${p.brand}`);
    console.log(`  Normalized Usable: ${brandUsable}`);
    console.log(`  Normalized Strict: ${brandStrict}`);
    console.log('------------------------------------------------------------');
  }

  await AppDataSource.destroy();
}

main().catch(console.error);
