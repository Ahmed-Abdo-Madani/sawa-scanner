import { Injectable, Logger } from '@nestjs/common';
import { ImageAnnotatorClient } from '@google-cloud/vision';
import { ConfigService } from '@nestjs/config';
import { createWorker, PSM } from 'tesseract.js';
import * as path from 'path';
import sharp from 'sharp';

@Injectable()
export class OcrService {
  private client: ImageAnnotatorClient;
  private readonly logger = new Logger(OcrService.name);

  constructor(private configService: ConfigService) {
    this.client = new ImageAnnotatorClient({
      keyFilename: this.configService.get<string>(
        'GOOGLE_APPLICATION_CREDENTIALS',
      ),
    });
  }

  /**
   * Orchestrates dynamic OCR. Tries local Tesseract.js first for cost efficiency.
   * If confidence is below 70%, falls back to Google Cloud Vision API.
   */
  async extractText(base64Image: string): Promise<string> {
    const rawBase64 = base64Image.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(rawBase64, 'base64');

    let worker: Tesseract.Worker | null = null;

    // Primary: Tesseract Local Extraction
    try {
      this.logger.log('Preprocessing image with sharp...');
      const image = sharp(buffer);
      const metadata = await image.metadata();
      const currentWidth = metadata.width || 0;
      const currentHeight = metadata.height || 0;

      let processed = image.rotate().grayscale();

      if (currentWidth > 0 && currentHeight > 0) {
        const shorterDimension = Math.min(currentWidth, currentHeight);
        if (shorterDimension < 2000) {
          const scale = 2000 / shorterDimension;
          processed = processed.resize({
            width: Math.round(currentWidth * scale),
            height: Math.round(currentHeight * scale),
            withoutEnlargement: false,
            kernel: 'lanczos3',
          });
        }
      }

      const processedBuffer = await processed
        .normalize()
        .linear(1.15, -10)
        .median(1)
        .sharpen({ sigma: 1 })
        .extend({
          top: 20,
          bottom: 20,
          left: 20,
          right: 20,
          background: { r: 255, g: 255, b: 255 },
        })
        .toFormat('png')
        .toBuffer();

      worker = await createWorker('ara+eng', 1, {
        langPath: path.join(process.cwd(), 'tessdata'),
      });

      await worker.setParameters({
        tessedit_pageseg_mode: PSM.AUTO,
        preserve_interword_spaces: '1',
        user_defined_dpi: '300',
        tessedit_do_invert: '0',
      });

      this.logger.log('Executing local Tesseract OCR passes...');

      const psmModes: Array<{ name: string; psm: PSM }> = [
        { name: 'AUTO', psm: PSM.AUTO },
        { name: 'SINGLE_BLOCK', psm: PSM.SINGLE_BLOCK },
        { name: 'SPARSE_TEXT', psm: PSM.SPARSE_TEXT },
      ];

      let best = { text: '', confidence: 0, mode: 'NONE' };
      for (const { name, psm } of psmModes) {
        await worker.setParameters({ tessedit_pageseg_mode: psm });
        const { data } = await worker.recognize(processedBuffer);
        const conf: number = Number((data as any).confidence ?? 0);
        this.logger.debug(
          `Tesseract PSM=${name} confidence=${conf.toFixed(1)}% chars=${String(data.text).trim().length}`,
        );
        if (conf > best.confidence && String(data.text).trim().length > 0) {
          best = { text: String(data.text), confidence: conf, mode: name };
        }
      }

      this.logger.log(
        `Tesseract best mean confidence: ${best.confidence.toFixed(1)}% (PSM=${best.mode})`,
      );

      const hasContent = best.text.trim().length >= 50;
      const lowerText = best.text.toLowerCase();
      // Look for common English or Arabic label keywords
      const hasKeywords = /(ingredients|nutrition|fat|protein|kcal|المكونات|دهون|بروتين|سعرات)/i.test(lowerText);

      if (best.confidence >= 60 && hasContent && hasKeywords) {
        this.logger.log(
          'Tesseract confidence and composite heuristics are high enough. Skipping Google Vision.',
        );
        return best.text;
      }

      this.logger.warn(
        `Tesseract heuristics failed (conf=${best.confidence.toFixed(1)}%, chars=${best.text.length}, hasKeywords=${hasKeywords}). Falling back to Google Vision...`,
      );
    } catch (error: any) {
      this.logger.error(
        `Tesseract OCR failed: ${error?.message || String(error)}. Falling back to Google Vision...`,
      );
    } finally {
      if (worker) {
        try {
          await worker.terminate();
        } catch (e: any) {
          this.logger.error(
            `Failed to terminate Tesseract worker: ${e?.message || String(e)}`,
          );
        }
      }
    }

    // Fallback: Google Cloud Vision API
    return this.googleVisionFallback(rawBase64);
  }

  /**
   * Fallback using Google Cloud Vision API with robust rate-limit handling built-in.
   */
  private async googleVisionFallback(
    base64Image: string,
    attempt: number = 1,
  ): Promise<string> {
    const request = {
      image: { content: base64Image },
      features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
      imageContext: { languageHints: ['ar', 'en'] },
    };

    try {
      this.logger.log(`Requesting Google Cloud Vision (Attempt ${attempt})...`);
      const [result] = await this.client.annotateImage(request as any);
      const text = result.fullTextAnnotation?.text;
      return text || '';
    } catch (error: any) {
      // 429 Too Many Requests Handling
      if (
        error?.code === 8 ||
        error?.code === 429 ||
        error?.message?.includes('Too Many Requests') ||
        error?.message?.includes('exceeded')
      ) {
        if (attempt <= 3) {
          const delayMs = attempt * 5000; // 5s, 10s, 15s
          this.logger.warn(
            `Google Vision rate limit reached. Retrying in ${delayMs / 1000}s (Attempt ${attempt}/3)...`,
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          return this.googleVisionFallback(base64Image, attempt + 1);
        }
      }
      this.logger.error('Google Vision Fallback failed:', error);
      throw new Error(
        `Failed to extract text from image: ${error?.message || String(error)}`,
      );
    }
  }
}
