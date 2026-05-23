import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from './../src/app.module';
import { ProductsService } from './../src/products/products.service';

describe('Products Service Seeding (e2e)', () => {
  let app: INestApplication;
  let productsService: ProductsService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    productsService = app.get(ProductsService);
  }, 60000);

  it('should pre-resolve barcode and seed product from target stores', async () => {
    const barcode = '6281007203348';
    console.log(`[Test] Querying findByGtin for barcode: ${barcode}...`);
    try {
      const product = await productsService.findByGtin(barcode);
      console.log(`[Test] Product Seeding Success!`);
      console.log(`[Test] Name (Ar): ${product.name_ar}`);
      console.log(`[Test] Name (En): ${product.name_en}`);
      console.log(`[Test] Image:     ${product.image_front_url}`);
      
      expect(product).toBeDefined();
      expect(product.gtin).toBe(barcode);
      expect(product.prices.length).toBeGreaterThan(0);
    } catch (err: any) {
      console.error('[Test] Seeding failed:', err.message);
      throw err;
    }
  }, 180000);

  afterAll(async () => {
    await app.close();
  });
});
