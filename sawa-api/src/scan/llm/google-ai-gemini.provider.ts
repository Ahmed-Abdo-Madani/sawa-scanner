import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ConfigService } from '@nestjs/config';
import { LlmStructuringProvider } from './llm-provider.interface';
import { StructuredLabelDto } from '../dto/structured-label.dto';
import { GeminiQuotaExceededException } from '../exceptions/gemini-quota-exceeded.exception';

@Injectable()
export class GoogleAiGeminiProvider implements LlmStructuringProvider {
  private readonly logger = new Logger(GoogleAiGeminiProvider.name);
  private genAI: GoogleGenerativeAI;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY') || '';
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  get name(): string {
    return 'GoogleAIGemini';
  }

  private getPrompt(rawOcrText: string): string {
    return `
      You are an expert nutrition label analyst specializing in Saudi Arabian food products.
      Extract and structure information from the following OCR text from a nutrition label.
      
      OCR TEXT:
      """
      ${rawOcrText}
      """

      INSTRUCTIONS:
      1. Return a JSON object matching the schema below.
      2. Handle Arabic nutrient aliases: 
         - 'دهون' -> fat_g
         - 'دهون مشبعة' -> saturated_fat_g
         - 'بروتين' -> protein_g
         - 'سكريات' -> sugars_g
         - 'ألياف' -> fiber_g
         - 'صوديوم' -> sodium_mg
         - 'سعرات حرارية' or 'طاقة' -> energy_kcal
         - 'كربوهيدرات' -> carbs_g
      3. All nutrient values should be numeric (float or int). If a range is given, use the average.
      4. Ingredients should include Arabic names where possible. Extract E-numbers if visible.
      5. If a field is missing, leave it as null or omit it.

      SCHEMA:
      {
        "name_ar": "Arabic product name",
        "name_en": "English product name",
        "brand": "Brand name",
        "net_weight": "e.g. 500g",
        "nutrition": {
          "energy_kcal": number,
          "fat_g": number,
          "saturated_fat_g": number,
          "carbs_g": number,
          "sugars_g": number,
          "fiber_g": number,
          "protein_g": number,
          "sodium_mg": number,
          "serving_size_g": number
        },
        "ingredients": [
          { "name_ar": "string", "name_en": "string", "e_number": "string" }
        ]
      }
    `;
  }

  async structureLabel(
    rawOcrText: string,
    attempt: number = 1,
    useFallbackModel = false,
  ): Promise<StructuredLabelDto> {
    try {
      const modelName = useFallbackModel
        ? this.configService.get<string>('GEMINI_FALLBACK_MODEL') ||
          'gemini-1.5-flash-8b'
        : this.configService.get<string>('GEMINI_MODEL') || 'gemini-2.0-flash';

      this.logger.log(
        `Calling Google AI Gemini API (${modelName}) to structure text (Attempt ${attempt})...`,
      );

      const model = this.genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          responseMimeType: 'application/json',
        },
      });

      const result = await model.generateContent(this.getPrompt(rawOcrText));
      const responseText = result.response.text();
      return JSON.parse(responseText) as StructuredLabelDto;
    } catch (error: any) {
      if (error.errorDetails) {
        // Check for QuotaFailure
        const hasDailyQuotaFailure = error.errorDetails.some((detail: any) => {
          if (detail['@type']?.includes('QuotaFailure') && detail.violations) {
            return detail.violations.some(
              (v: any) =>
                v.quotaId?.includes('PerDay') || v.subject?.includes('PerDay'),
            );
          }
          return false;
        });

        if (hasDailyQuotaFailure) {
          throw new GeminiQuotaExceededException(
            `Google AI ${useFallbackModel ? 'Fallback ' : ''}Gemini Daily Quota Exceeded`,
          );
        }

        // RetryInfo Delay Math
        const retryInfo = error.errorDetails.find((d: any) =>
          d['@type']?.includes('RetryInfo'),
        );
        if (retryInfo && retryInfo.retryDelay) {
          if (attempt <= 2) {
            const delaySec = parseFloat(retryInfo.retryDelay.replace('s', ''));
            // Capped to 15s wait
            const delayMs = Math.min(delaySec * 1000, 15000);
            this.logger.warn(
              `Gemini RetryInfo given. Waiting ${delayMs / 1000}s (Attempt ${attempt}/2)...`,
            );
            await new Promise((resolve) => setTimeout(resolve, delayMs));
            return this.structureLabel(
              rawOcrText,
              attempt + 1,
              useFallbackModel,
            );
          }
        }
      }

      if (
        error.message?.includes('429') ||
        error.message?.includes('exceeded') ||
        error.message?.includes('quota')
      ) {
        // Throw Quota if it's explicitly daily, or fallback attempt limit reached
        // We'll use exponential backoff + jitter for generic 429
        if (attempt <= 2) {
          const jitter = Math.random() * 1000;
          const delayMs = Math.pow(2, attempt) * 1000 + jitter;
          this.logger.warn(
            `Gemini API Rate Limit/Quota hit. Cooling down for ${delayMs / 1000}s (Attempt ${attempt}/2)...`,
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          return this.structureLabel(rawOcrText, attempt + 1, useFallbackModel);
        }
      }

      if (
        !useFallbackModel &&
        this.configService.get<string>('GEMINI_FALLBACK_MODEL')
      ) {
        this.logger.warn(
          `Primary model failed. Attempting with fallback model.`,
        );
        return this.structureLabel(rawOcrText, 1, true);
      }

      this.logger.error('Google AI Gemini structuring failed:', error);
      throw error;
    }
  }
}
