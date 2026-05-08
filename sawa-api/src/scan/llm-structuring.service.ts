import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StructuredLabelDto } from './dto/structured-label.dto';
import { LlmStructuringProvider } from './llm/llm-provider.interface';
import { GoogleAiGeminiProvider } from './llm/google-ai-gemini.provider';
import { VertexGeminiProvider } from './llm/vertex-gemini.provider';
import { GeminiQuotaExceededException } from './exceptions/gemini-quota-exceeded.exception';

@Injectable()
export class LlmStructuringService {
  private readonly logger = new Logger(LlmStructuringService.name);
  private providers: LlmStructuringProvider[] = [];

  constructor(
    private configService: ConfigService,
    private googleAiProvider: GoogleAiGeminiProvider,
    private vertexProvider: VertexGeminiProvider,
  ) {
    // Default to Google AI for label OCR structuring (Comment 3)
    // Vertex is optional and can be selected via LLM_PROVIDER=vertex
    const selectedProvider =
      this.configService.get<string>('LLM_PROVIDER') || 'google-ai';

    if (selectedProvider === 'vertex') {
      this.providers.push(this.vertexProvider);
      this.providers.push(this.googleAiProvider); // Fallback
    } else {
      this.providers.push(this.googleAiProvider);
      // Can add more providers later, like Anthropic
    }
  }

  async structureLabel(rawOcrText: string): Promise<StructuredLabelDto> {
    let lastError: any = null;

    for (const provider of this.providers) {
      this.logger.log(`Attempting structuring with provider: ${provider.name}`);
      try {
        const result = await provider.structureLabel(rawOcrText);
        return result;
      } catch (error) {
        lastError = error;
        if (error instanceof GeminiQuotaExceededException) {
          this.logger.warn(
            `Provider ${provider.name} failed with Quota Exceeded. Trying next provider...`,
          );
          continue; // try next provider
        }

        // If it's a standard error that isn't Quota Exceeded, we could optionally break or continue.
        // Continuing for robustness in fallback.
        this.logger.warn(
          `Provider ${provider.name} failed. Error: ${error.message}. Trying next provider...`,
        );
        continue;
      }
    }

    this.logger.error('All LLM structuring providers failed.');
    throw (
      lastError ||
      new Error('All LLM providers failed to structure label data.')
    );
  }
}
