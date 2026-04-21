import {
  Injectable,
  BadRequestException,
  ServiceUnavailableException,
  UnprocessableEntityException,
  Logger,
} from '@nestjs/common';
import { OcrService } from './ocr.service';
import { LlmStructuringService } from './llm-structuring.service';
import { LabelValidationService } from './label-validation.service';
import { StructuredLabelDto } from './dto/structured-label.dto';
import { GeminiQuotaExceededException } from './exceptions/gemini-quota-exceeded.exception';

@Injectable()
export class LabelCoreService {
  private readonly logger = new Logger(LabelCoreService.name);

  constructor(
    private readonly ocrService: OcrService,
    private readonly llmService: LlmStructuringService,
    private readonly validationService: LabelValidationService,
  ) {}

  /**
   * Orchestrates the full OCR -> Structuring -> Validation pipeline.
   * Enforces that both nutrition and ingredients are present and valid.
   */
  async processImage(imageBase64: string): Promise<StructuredLabelDto> {
    const timeoutMsg =
      'Label processing timed out after 30 seconds due to server load or rate limits. Please try again.';
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new ServiceUnavailableException(timeoutMsg)),
        30000,
      );
    });

    const executionPromise = async () => {
      this.logger.log('Starting full label processing pipeline...');
      // 1. OCR Extraction
      const rawText = await this.ocrService.extractText(imageBase64);
      if (!rawText || rawText.trim().length === 0) {
        throw new BadRequestException(
          'No text could be extracted from the image',
        );
      }

      // 2. LLM Structuring
      let structuredData: StructuredLabelDto;
      try {
        structuredData = await this.llmService.structureLabel(rawText);
      } catch (error) {
        const isQuota = error instanceof GeminiQuotaExceededException;
        throw new UnprocessableEntityException({
          message: isQuota 
            ? 'LLM provider quota exhausted — please try again tomorrow or upgrade plan'
            : `Failed to structure label data: ${error.message || 'Unknown error'}`,
          rawOcrText: rawText,
          failedStage: 'structuring',
          retryable: isQuota ? false : true,
        });
      }

      if (!structuredData) {
        throw new UnprocessableEntityException({
          message: 'Failed to structure the label data from extracted text',
          rawOcrText: rawText,
          failedStage: 'structuring',
          retryable: true,
        });
      }

      // 3. Heuristic Validation (Checks macro sums, non-negatives, etc.)
      try {
        this.validationService.validate(structuredData);
      } catch (error) {
        throw new UnprocessableEntityException({
          message: error.message || 'Validation failed',
          rawOcrText: rawText,
          failedStage: 'validation',
          retryable: false,
        });
      }

      // 4. Critical Invariants: Both Nutrition and Ingredients must be present
      if (!structuredData.nutrition) {
        throw new UnprocessableEntityException({
          message: 'Nutrition facts are missing or could not be structured',
          rawOcrText: rawText,
          failedStage: 'validation',
          retryable: false,
        });
      }

      if (
        !structuredData.ingredients ||
        structuredData.ingredients.length === 0
      ) {
        throw new UnprocessableEntityException({
          message: 'Ingredient list is required but missing or empty',
          rawOcrText: rawText,
          failedStage: 'validation',
          retryable: false,
        });
      }

      this.logger.log('Label pipeline succeeded successfully.');
      return structuredData;
    };

    return Promise.race([executionPromise(), timeoutPromise]);
  }
}
