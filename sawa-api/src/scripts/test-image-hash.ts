import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import { ImageHashService } from '../ingestion/image-hash.service';

async function runTest() {
  console.log('============================================================');
  console.log('🚀 RUNNING IMAGE HASHING & AUTOCROP MATCHING VERIFICATION');
  console.log('============================================================\n');

  const img1Path = path.resolve(
    'C:\\Users\\Design_Bench_12\\.gemini\\antigravity\\brain\\442bcea5-58d9-497a-8d91-9ad1d2de87a7\\media__1779346512652.png',
  );
  const img2Path = path.resolve(
    'C:\\Users\\Design_Bench_12\\.gemini\\antigravity\\brain\\442bcea5-58d9-497a-8d91-9ad1d2de87a7\\media__1779346536321.png',
  );

  if (!fs.existsSync(img1Path) || !fs.existsSync(img2Path)) {
    console.error('❌ Error: Test images not found at designated locations!');
    return;
  }

  const img1Buffer = fs.readFileSync(img1Path);
  const img2Buffer = fs.readFileSync(img2Path);

  const hashService = new ImageHashService();

  // Test Case A: Calculating difference hashes WITHOUT any trim preprocessing
  console.log('--- TEST 1: WITHOUT TRIM PREPROCESSING (RAW IMAGES) ---');
  const untrimmedHash1 = await generateUntrimmedHash(img1Buffer);
  const untrimmedHash2 = await generateUntrimmedHash(img2Buffer);
  const untrimmedDistance = hashService.calculateHammingDistance(
    untrimmedHash1,
    untrimmedHash2,
  );

  console.log(`Image 1 (Etaam - padded) Hash : 0x${untrimmedHash1}`);
  console.log(`Image 2 (HS - cropped) Hash   : 0x${untrimmedHash2}`);
  console.log(`Hamming Distance (Raw)        : ${untrimmedDistance} bits`);
  if (untrimmedDistance <= 6) {
    console.log('✨ Outcome: MATCH DETECTED');
  } else {
    console.log('❌ Outcome: MISMATCH (False Negative)');
  }
  console.log('\n');

  // Test Case B: Calculating difference hashes WITH trim preprocessing (Our Autocrop Solution)
  console.log('--- TEST 2: WITH TRIM PREPROCESSING (OUR AUTOCROP) ---');
  const trimmedHash1 = await hashService.generateHashFromBuffer(img1Buffer);
  const trimmedHash2 = await hashService.generateHashFromBuffer(img2Buffer);
  const trimmedDistance = hashService.calculateHammingDistance(
    trimmedHash1,
    trimmedHash2,
  );

  console.log(`Image 1 (Etaam - padded) Hash : 0x${trimmedHash1}`);
  console.log(`Image 2 (HS - cropped) Hash   : 0x${trimmedHash2}`);
  console.log(`Hamming Distance (Trimmed)    : ${trimmedDistance} bits`);
  if (trimmedDistance <= 6) {
    console.log('✨ Outcome: SUCCESSFUL MATCH DETECTED! 🎉');
  } else {
    console.log('❌ Outcome: MISMATCH');
  }
  console.log('\n============================================================');
}

/**
 * Helper to compute untrimmed dHash for visual comparison.
 */
async function generateUntrimmedHash(buffer: Buffer): Promise<string> {
  const rawPixels = await sharp(buffer)
    .flatten({ background: '#ffffff' })
    .resize(9, 8, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer();

  let binaryHash = '';
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const leftIndex = row * 9 + col;
      const rightIndex = row * 9 + col + 1;
      binaryHash += rawPixels[leftIndex] > rawPixels[rightIndex] ? '1' : '0';
    }
  }

  const decimalHash = BigInt('0b' + binaryHash);
  return decimalHash.toString(16).padStart(16, '0');
}

runTest().catch((err) => {
  console.error('❌ Test execution crashed:', err);
});
