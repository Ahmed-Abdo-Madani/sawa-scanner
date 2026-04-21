import { StructuredLabelDto } from '../dto/structured-label.dto';

export interface LlmStructuringProvider {
  get name(): string;
  structureLabel(
    rawOcrText: string,
    attempt?: number,
  ): Promise<StructuredLabelDto>;
}
