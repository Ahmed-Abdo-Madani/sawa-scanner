
import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { LlmStructuringService } from './src/scan/llm-structuring.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const llmService = app.get(LlmStructuringService);

  console.log('Testing Gemini API connection...');
  try {
    const result = await llmService.structureLabel('Sample text: Milk, 200ml, 5g protein');
    console.log('Gemini Response:', JSON.stringify(result, null, 2));
    console.log('SUCCESS: Gemini API is working!');
  } catch (error) {
    console.error('FAILED: Gemini API error:', error.message);
  } finally {
    await app.close();
  }
}
bootstrap();
