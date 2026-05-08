/**
 * Centralized queue name constants for BullMQ.
 * Use these across all queue producers, workers, and Bull Board configurations
 * to ensure consistency and prevent mismatches.
 */

export const QUEUE_NAMES = {
  INGESTION: 'ingestion-queue',
  PRICE_SCRAPING: 'price-scraping-queue',
  OCR: 'ocr-queue',
} as const;
