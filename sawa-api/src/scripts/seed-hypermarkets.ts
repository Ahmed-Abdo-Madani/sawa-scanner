import { DataSource } from 'typeorm';
import { Merchant } from '../entities/merchant.entity';
import * as dotenv from 'dotenv';

dotenv.config();

async function seed() {
  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DATABASE_HOST,
    port: parseInt(process.env.DATABASE_PORT || '5432'),
    username: process.env.DATABASE_USERNAME,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
    entities: [Merchant],
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });

  try {
    await dataSource.initialize();
    console.log('Database initialized');

    const merchantRepo = dataSource.getRepository(Merchant);

    const merchants = [
      {
        name_en: 'Carrefour',
        name_ar: 'كارفور',
        base_url: 'https://www.carrefourksa.com',
        logo_url: 'https://www.carrefourksa.com/mafksa/config/carrefour-logo.svg',
        data_source_type: 'web',
      },
      {
        name_en: 'Panda',
        name_ar: 'بنده',
        base_url: 'https://panda.sa',
        logo_url: 'https://panda.sa/media/logo/stores/1/Logo-min.png',
        data_source_type: 'web',
      },
      {
        name_en: 'Othaim',
        name_ar: 'العثيم',
        base_url: 'https://www.othaimmarkets.com',
        logo_url: 'https://www.noon.com/saudi-en/othaim-supermarket/', // Storefront reference
        data_source_type: 'web',
      },
      {
        name_en: 'Tamimi',
        name_ar: 'تميمي',
        base_url: 'https://www.tamimimarkets.com',
        logo_url: 'https://shop.tamimimarkets.com/assets/images/logo.png',
        data_source_type: 'web',
      },
    ];

    for (const m of merchants) {
      const existing = await merchantRepo.findOne({ where: { name_en: m.name_en } });
      if (!existing) {
        const newMerchant = merchantRepo.create(m);
        await merchantRepo.save(newMerchant);
        console.log(`Seeded: ${m.name_en}`);
      } else {
        console.log(`Exists: ${m.name_en}`);
      }
    }

    console.log('Seeding complete');
  } catch (error) {
    console.error('Seeding failed:', error);
  } finally {
    await dataSource.destroy();
  }
}

seed();
