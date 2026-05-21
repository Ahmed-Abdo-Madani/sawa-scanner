import { AppDataSource } from '../data-source';
import { ProductImage } from '../entities/product-image.entity';
import { ImageHashService } from '../ingestion/image-hash.service';

async function dryRun() {
  console.log('============================================================');
  console.log('🚀 STARTING IMAGE HASH DRY RUN (LIMIT: 100 IMAGES)');
  console.log('============================================================\n');

  // Initialize DB Connection
  await AppDataSource.initialize();
  console.log('✓ Database connection initialized successfully.\n');

  const imageRepo = AppDataSource.getRepository(ProductImage);
  
  // Select up to 100 images that don't have a hash yet
  const images = await imageRepo
    .createQueryBuilder('image')
    .where('image.image_hash IS NULL')
    .limit(100)
    .getMany();

  if (images.length === 0) {
    console.log('ℹ️ No images found lacking an image_hash. Everything is already processed!');
    await AppDataSource.destroy();
    return;
  }

  console.log(`Fetched ${images.length} images for dry run processing.\n`);

  const hashService = new ImageHashService();
  
  let successCount = 0;
  let failureCount = 0;
  let totalTimeMs = 0;
  const failureReasons: { [key: string]: number } = {};

  for (let i = 0; i < images.length; i++) {
    const image = images[i];
    const indexStr = `[${i + 1}/${images.length}]`;
    
    console.log(`${indexStr} Processing URL: ${image.url}`);
    
    const startTime = Date.now();
    try {
      const hash = await hashService.generateHashFromUrl(image.url);
      const duration = Date.now() - startTime;
      
      successCount++;
      totalTimeMs += duration;
      
      console.log(`  └─ ✅ Success! Hash: 0x${hash} | Time: ${duration}ms`);
    } catch (err) {
      failureCount++;
      const errMsg = err.message || 'Unknown Error';
      console.error(`  └─ ❌ Failed! Reason: ${errMsg}`);
      
      // Categorize failures
      let category = 'HTTP Error / Timeout';
      if (errMsg.includes('404')) category = 'HTTP 404 (Not Found)';
      else if (errMsg.includes('403')) category = 'HTTP 403 (Forbidden)';
      else if (errMsg.includes('timeout')) category = 'Connection Timeout';
      else if (errMsg.includes('trim')) category = 'Image Trimming Error';

      failureReasons[category] = (failureReasons[category] || 0) + 1;
    }
  }

  const averageTime = successCount > 0 ? (totalTimeMs / successCount).toFixed(1) : '0';

  console.log('\n============================================================');
  console.log('📊 DRY RUN COMPLETED - FINAL STATISTICS');
  console.log('============================================================');
  console.log(`Total Attempted : ${images.length}`);
  console.log(`Total Success   : ${successCount} (${Math.round((successCount / images.length) * 100)}%)`);
  console.log(`Total Failed    : ${failureCount} (${Math.round((failureCount / images.length) * 100)}%)`);
  console.log(`Avg Processing  : ${averageTime}ms per successful image`);
  
  if (failureCount > 0) {
    console.log('\n❌ Failure Categorization:');
    Object.entries(failureReasons).forEach(([reason, count]) => {
      console.log(`  - ${reason}: ${count} images`);
    });
  }
  console.log('============================================================\n');

  await AppDataSource.destroy();
}

dryRun().catch(async (error) => {
  console.error('❌ Dry run crashed:', error);
  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
  }
});
