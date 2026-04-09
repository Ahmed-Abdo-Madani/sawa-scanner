import { Injectable } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ConfigService } from '@nestjs/config';
import { StructuredLabelDto } from './dto/structured-label.dto';

@Injectable()
export class LlmStructuringService {
  private genAI: GoogleGenerativeAI;
  private model: any;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY') || '';
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ 
      model: 'gemini-2.0-flash',
      generationConfig: {
        responseMimeType: 'application/json',
      },
    });
  }

  async structureLabel(rawOcrText: string): Promise<StructuredLabelDto> {
    const prompt = `
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

    try {
      const result = await this.model.generateContent(prompt);
      const responseText = result.response.text();
      return JSON.parse(responseText) as StructuredLabelDto;
    } catch (error) {
      console.error('Gemini structuring failed:', error);
      throw new Error(`Failed to structure label data: ${error.message}`);
    }
  }
}
