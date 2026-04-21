export class GeminiQuotaExceededException extends Error {
  constructor(message: string = 'Gemini API Daily Quota Exceeded') {
    super(message);
    this.name = 'GeminiQuotaExceededException';
  }
}
