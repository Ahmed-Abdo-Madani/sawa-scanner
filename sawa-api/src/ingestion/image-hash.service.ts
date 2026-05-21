import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import sharp from 'sharp';

@Injectable()
export class ImageHashService {
  private readonly logger = new Logger(ImageHashService.name);

  /**
   * Generates a 64-bit perceptual Difference Hash (dHash) from an image buffer.
   * Employs sharp's .trim() to automatically discard surrounding whitespace.
   */
  async generateHashFromBuffer(buffer: Buffer): Promise<string> {
    let rawPixels: Buffer;

    try {
      // Step 1: Attempt to trim whitespace border to align the core product tightly
      rawPixels = await sharp(buffer)
        .flatten({ background: '#ffffff' }) // Flatten transparent alpha channel to white
        .trim({ background: '#ffffff', threshold: 12 })
        .resize(9, 8, { fit: 'fill' })
        .grayscale()
        .raw()
        .toBuffer();
    } catch (trimError) {
      // Graceful fallback if the image is a solid color (where trimming reduces size to 0x0)
      this.logger.warn(
        `Trim failed (possibly a solid color image), falling back to untrimmed hash. Error: ${trimError.message}`,
      );
      rawPixels = await sharp(buffer)
        .resize(9, 8, { fit: 'fill' })
        .grayscale()
        .raw()
        .toBuffer();
    }

    // Step 2: Compute Difference Hash (dHash)
    // dHash compares adjacent pixels horizontally in a 9x8 grid.
    // 8 rows * 8 comparisons = 64 bits.
    let binaryHash = '';
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const leftIndex = row * 9 + col;
        const rightIndex = row * 9 + col + 1;
        const leftPixel = rawPixels[leftIndex];
        const rightPixel = rawPixels[rightIndex];

        binaryHash += leftPixel > rightPixel ? '1' : '0';
      }
    }

    // Step 3: Convert binary representation of 64 bits to a 16-character hex string
    const decimalHash = BigInt('0b' + binaryHash);
    return decimalHash.toString(16).padStart(16, '0');
  }

  /**
   * Downloads an image from a URL and generates its perceptual dHash.
   */
  async generateHashFromUrl(url: string): Promise<string> {
    try {
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 10000, // 10s timeout
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });
      return await this.generateHashFromBuffer(Buffer.from(response.data));
    } catch (error) {
      this.logger.error(`Failed to generate hash from URL: ${url}. Error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Calculates the Hamming distance (number of differing bits) between two dHashes.
   * Values range from 0 (visually identical) to 64 (completely opposite).
   * A distance <= 6 indicates an extremely strong visual match in retail catalogs.
   */
  calculateHammingDistance(hash1: string, hash2: string): number {
    const bigInt1 = BigInt('0x' + hash1);
    const bigInt2 = BigInt('0x' + hash2);

    // XOR operation yields a bitmask of differing bits
    let xorResult = bigInt1 ^ bigInt2;

    // Count set bits (Hamming Weight) using standard bitwise reduction
    let distance = 0;
    while (xorResult > 0n) {
      if (xorResult & 1n) {
        distance++;
      }
      xorResult >>= 1n;
    }

    return distance;
  }
}
