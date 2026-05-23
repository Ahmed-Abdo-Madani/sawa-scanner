import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { ProductsService } from '../products/products.service';

async function testResolution() {
  console.log('============================================================');
  console.log('🚀 TESTING GTIN PRE-RESOLUTION AND SEEDING FOR 6281091006964');
  console.log('============================================================\n');

  const app = await NestFactory.createApplicationContext(AppModule);
  const productsService = app.get(ProductsService);

  const barcodes = ['8906131952855', '6265302840660'];

  for (const barcode of barcodes) {
    console.log(`\n🔍 Querying findByGtin for barcode: ${JSON.stringify(barcode)}...`);
    try {
      const product = await productsService.findByGtin(barcode);
      console.log('✨ Seeding Success!');
      console.log(`Product Name (Ar): ${product.name_ar}`);
      console.log(`Product Name (En): ${product.name_en}`);
      console.log(`GTIN:             ${product.gtin}`);
      console.log(`Image:            ${product.image_front_url}`);
      console.log('Prices:');
      if (product.prices) {
        product.prices.forEach((p) => {
          console.log(` - Merchant ${p.merchant?.name_ar || p.merchant?.name_en}: ${p.price_sar_incl_vat} SAR (Stock: ${p.in_stock}, URL: ${p.source_url})`);
        });
      }
    } catch (err: any) {
      console.error(`❌ Seeding failed for ${JSON.stringify(barcode)}:`, err.message);
    }
  }

  await app.close();
}

testResolution().catch((err) => {
  console.error('Fatal crash:', err);
});
