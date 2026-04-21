import { Injectable, Logger } from '@nestjs/common';
import { VertexAI } from '@google-cloud/vertexai';
import { ConfigService } from '@nestjs/config';
import { LlmStructuringProvider } from './llm-provider.interface';
import { StructuredLabelDto } from '../dto/structured-label.dto';

@Injectable()
export class VertexGeminiProvider implements LlmStructuringProvider {
  private readonly logger = new Logger(VertexGeminiProvider.name);
  private vertexAi: VertexAI;

  constructor(private configService: ConfigService) {
    const project =
      this.configService.get<string>('VERTEX_PROJECT_ID') ||
      this.configService.get<string>('FIREBASE_PROJECT_ID');
    const location =
      this.configService.get<string>('VERTEX_LOCATION') || 'me-central2';

    // Assumes GOOGLE_APPLICATION_CREDENTIALS is set in env
    this.vertexAi = new VertexAI({
      project: project as string,
      location: location,
    });
  }

  get name(): string {
    return 'VertexAIGemini';
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
  ): Promise<StructuredLabelDto> {
    try {
      const modelName =
        this.configService.get<string>('GEMINI_MODEL') || 'gemini-2.0-flash';
      this.logger.log(
        `Calling Vertex AI Gemini API (${modelName}) to structure text (Attempt ${attempt})...`,
      );

      const model = this.vertexAi.getGenerativeModel({
        model: modelName,
        generationConfig: {
          responseMimeType: 'application/json',
        },
      });

      const result = await model.generateContent(this.getPrompt(rawOcrText));
      const responseText =
        result.response.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      return JSON.parse(responseText) as StructuredLabelDto;
    } catch (error: any) {
      // Inspect the error to fail fast on permanent configuration or client errors
      const statusCode = error?.status || error?.code || error?.response?.status;
      
      if (
        statusCode === 400 || // Bad Request (invalid model name, etc.)
        statusCode === 401 || // Unauthenticated
        statusCode === 403 || // Permission Denied (no Vertex AI API enabled)
        statusCode === 404    // Not Found (wrong project/location/model)
      ) {
        this.logger.error(
          `Vertex AI permanent error (${statusCode}). Failing fast. Check project, location, and credentials.`, 
          error
        );
        throw error;
      }

      if (attempt <= 2) {
        const jitter = Math.random() * 1000;
        const delayMs = Math.pow(2, attempt) * 1000 + jitter;
        this.logger.warn(
          `Vertex API transient error or rate limit hit. Cooling down for ${delayMs / 1000}s (Attempt ${attempt}/2)...`
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        return this.structureLabel(rawOcrText, attempt + 1);
      }

      this.logger.error('Vertex AI Gemini structuring failed after retries:', error);
      throw error;
    }
  }
}
