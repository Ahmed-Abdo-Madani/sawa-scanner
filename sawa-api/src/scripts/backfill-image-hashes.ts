import { AppDataSource } from '../data-source';
import { ProductImage } from '../entities/product-image.entity';
import { ImageHashService } from '../ingestion/image-hash.service';

// Configuration
const BATCH_SIZE = 50; // Save to database after every 50 processed images
const CONCURRENCY_LIMIT = 5; // Download and hash 5 images concurrently

async function backfill() {
  console.log('============================================================');
  console.log('🚀 INITIALIZING PRODUCTION PERCEPTUAL IMAGE HASH BACKFILL');
  console.log('============================================================\n');

  // Initialize DB Connection
  await AppDataSource.initialize();
  console.log('✓ Database connection initialized successfully.');

  const imageRepo = AppDataSource.getRepository(ProductImage);
  const hashService = new ImageHashService();

  // Find total images that still require hashing
  const totalCount = await imageRepo
    .createQueryBuilder('image')
    .where('image.image_hash IS NULL')
    .getCount();

  if (totalCount === 0) {
    console.log('✨ All images in the database already have perceptual hashes. Backfill is complete!');
    await AppDataSource.destroy();
    return;
  }

  console.log(`📊 Found a total of ${totalCount} images needing hashes.`);
  console.log(`⚙️ Running with Batch Size: ${BATCH_SIZE} | Concurrency Limit: ${CONCURRENCY_LIMIT}\n`);

  let processedCount = 0;
  let successCount = 0;
  let permanentFailureCount = 0;
  let transientFailureCount = 0;
  
  const processedIds = new Set<string>();
  const startTime = Date.now();

  while (true) {
    // Fetch a batch of images without hashes and not processed in this run
    const query = imageRepo
      .createQueryBuilder('image')
      .where('image.image_hash IS NULL');

    if (processedIds.size > 0) {
      query.andWhere('image.id NOT IN (:...ids)', { ids: Array.from(processedIds) });
    }

    const batchImages = await query.limit(BATCH_SIZE).getMany();

    if (batchImages.length === 0) {
      break;
    }

    console.log(`📦 Processing batch of ${batchImages.length} images (Total processed in session: ${processedCount} / ${totalCount})...`);

    const imagesToUpdate: ProductImage[] = [];

    // Process the batch in concurrent chunks of size CONCURRENCY_LIMIT
    for (let i = 0; i < batchImages.length; i += CONCURRENCY_LIMIT) {
      const chunk = batchImages.slice(i, i + CONCURRENCY_LIMIT);
      
      await Promise.all(
        chunk.map(async (image) => {
          processedIds.add(image.id);
          try {
            const hash = await hashService.generateHashFromUrl(image.url);
            image.image_hash = hash;
            imagesToUpdate.push(image);
            successCount++;
          } catch (err) {
            const errMsg = err.message || '';
            const isPermanent = errMsg.includes('404') || errMsg.includes('410') || errMsg.includes('Invalid URL');
            
            if (isPermanent) {
              permanentFailureCount++;
              // Store 'FAILED' to permanently skip re-downloading this broken URL in subsequent backfills
              image.image_hash = 'FAILED';
              imagesToUpdate.push(image);
              console.error(`  ❌ Permanent failure for URL: ${image.url}. Marked as FAILED. Error: ${errMsg}`);
            } else {
              transientFailureCount++;
              // Skip updating DB (remains NULL so we can try in a future session), but skipped in this session
              console.warn(`  ⚠️ Transient failure for URL: ${image.url}. Skipped in this run. Error: ${errMsg}`);
            }
          }
        }),
      );
    }

    // Save the successfully processed and permanently failed batch back to the database
    if (imagesToUpdate.length > 0) {
      await imageRepo.save(imagesToUpdate);
    }

    processedCount += batchImages.length;
    
    // Print live batch statistics
    const elapsedMinutes = ((Date.now() - startTime) / 60000).toFixed(1);
    const progressPercent = Math.min(100, Math.round((processedCount / totalCount) * 100));
    console.log(`  └─ Batch Complete. Progress: ${progressPercent}% | Success: ${successCount} | Permanent Failed: ${permanentFailureCount} | Transient Failed: ${transientFailureCount} | Elapsed: ${elapsedMinutes}m\n`);
  }

  const totalTimeSeconds = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('============================================================');
  console.log('🎉 PRODUCTION BACKFILL COMPLETED SUCCESSFULLY!');
  console.log('============================================================');
  console.log(`Total Processed   : ${processedCount}`);
  console.log(`Successful Hashes : ${successCount}`);
  console.log(`Permanent Failures: ${permanentFailureCount} (marked as FAILED)`);
  console.log(`Transient Skipped : ${transientFailureCount} (re-attemptable next run)`);
  console.log(`Total Duration    : ${totalTimeSeconds} seconds`);
  console.log('============================================================\n');

  await AppDataSource.destroy();
}

backfill().catch(async (error) => {
  console.error('❌ Production backfill crashed:', error);
  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
  }
});
