import { Injectable } from '@nestjs/common';
import { ImageAnnotatorClient } from '@google-cloud/vision';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class OcrService {
  private client: ImageAnnotatorClient;

  constructor(private configService: ConfigService) {
    this.client = new ImageAnnotatorClient({
      keyFilename: this.configService.get<string>('GOOGLE_APPLICATION_CREDENTIALS'),
    });
  }

  /**
   * Extracts text from a base64 encoded image using Google Cloud Vision.
   * Supports bilingual extraction (Arabic and English).
   */
  async extractText(base64Image: string): Promise<string> {
    const request = {
      image: {
        content: base64Image.replace(/^data:image\/\w+;base64,/, ''),
      },
      features: [{ type: 'TEXT_DETECTION' }],
      imageContext: {
        languageHints: ['ar', 'en'],
      },
    };

    try {
      const [result] = await this.client.annotateImage(request as any);
      const text = result.fullTextAnnotation?.text;
      return text || '';
    } catch (error) {
      console.error('OCR Extraction failed:', error);
      throw new Error(`Failed to extract text from image: ${error.message}`);
    }
  }
}
