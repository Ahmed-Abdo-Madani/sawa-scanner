import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { OcrService } from './ocr.service';
import { LlmStructuringService } from './llm-structuring.service';
import { LabelValidationService } from './label-validation.service';
import { StructuredLabelDto } from './dto/structured-label.dto';

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
    // 1. OCR Extraction
    const rawText = await this.ocrService.extractText(imageBase64);
    if (!rawText || rawText.trim().length === 0) {
      throw new BadRequestException(
        'No text could be extracted from the image',
      );
    }

    // 2. LLM Structuring
    const structuredData = await this.llmService.structureLabel(rawText);
    if (!structuredData) {
      throw new BadRequestException(
        'Failed to structure the label data from extracted text',
      );
    }

    // 3. Heuristic Validation (Checks macro sums, non-negatives, etc.)
    this.validationService.validate(structuredData);

    // 4. Critical Invariants: Both Nutrition and Ingredients must be present
    if (!structuredData.nutrition) {
      throw new BadRequestException(
        'Nutrition facts are missing or could not be structured',
      );
    }

    if (
      !structuredData.ingredients ||
      structuredData.ingredients.length === 0
    ) {
      throw new BadRequestException(
        'Ingredient list is required but missing or empty',
      );
    }

    return structuredData;
  }
}
