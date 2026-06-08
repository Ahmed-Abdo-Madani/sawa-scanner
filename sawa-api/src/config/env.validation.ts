import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  validateSync,
} from 'class-validator';

enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
  Staging = 'staging',
}

enum CloudRegion {
  Bahrain = 'me-south-1',
  Dammam = 'me-central2-a',
}

class EnvironmentVariables {
  @IsEnum(Environment)
  NODE_ENV: Environment;

  @IsEnum(CloudRegion)
  @IsNotEmpty()
  CLOUD_REGION: CloudRegion;

  @IsString()
  @IsNotEmpty()
  DATABASE_HOST: string;

  @IsNumber()
  DATABASE_PORT: number;

  @IsString()
  @IsNotEmpty()
  DATABASE_NAME: string;

  @IsString()
  @IsNotEmpty()
  DATABASE_USERNAME: string;

  @IsString()
  @IsNotEmpty()
  DATABASE_PASSWORD: string;

  @IsString()
  DATABASE_SSL: string;

  @IsString()
  @IsNotEmpty()
  REDIS_HOST: string;

  @IsNumber()
  REDIS_PORT: number;

  @IsString()
  REDIS_USERNAME: string;

  @IsString()
  REDIS_PASSWORD: string;

  @IsString()
  REDIS_TLS: string;

  @IsString()
  @IsNotEmpty()
  FIREBASE_PROJECT_ID: string;

  @IsString()
  @IsNotEmpty()
  FIREBASE_CLIENT_EMAIL: string;

  @IsString()
  @IsNotEmpty()
  FIREBASE_PRIVATE_KEY: string;

  // Required only when GTIN_AI_ENABLE_VERTEX=true or LLM_PROVIDER=vertex
  @IsOptional()
  @IsString()
  GOOGLE_APPLICATION_CREDENTIALS?: string;

  // Conditionally enforced in the post-validation block (mirrors GOOGLE_APPLICATION_CREDENTIALS pattern)
  @IsOptional()
  @IsString()
  GEMINI_API_KEY?: string;

  @IsOptional()
  @IsString()
  GEMINI_MODEL?: string;

  @IsOptional()
  @IsString()
  GEMINI_FALLBACK_MODEL?: string;

  @IsOptional()
  @IsString()
  LLM_PROVIDER?: string;

  @IsOptional()
  @IsString()
  GTIN_AI_MATCH_MODEL?: string;

  @IsOptional()
  @IsString()
  GTIN_AI_MATCH_FALLBACK_MODEL?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  GTIN_AI_ENABLE_VERTEX?: string;

  // Required only when GTIN_AI_ENABLE_VERTEX=true or LLM_PROVIDER=vertex
  @IsOptional()
  @IsString()
  VERTEX_PROJECT_ID?: string;

  // Required only when GTIN_AI_ENABLE_VERTEX=true or LLM_PROVIDER=vertex
  @IsOptional()
  @IsString()
  VERTEX_LOCATION?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  INGESTION_WORKER_CONCURRENCY?: number;

  @IsOptional()
  @IsIn(['true', 'false'])
  HUNGERSTATION_DISCOVERY_ENABLED?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  HUNGERSTATION_DAILY_ENABLED?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  HUNGERSTATION_DAILY_STAGGER_MS?: number;

  @IsOptional()
  @IsString()
  OFF_BACKFILL_USER_AGENT?: string;

  @IsOptional()
  @IsString()
  OFF_BACKFILL_BRANDS?: string;

  @IsOptional()
  @IsString()
  OFF_DUMP_PATH?: string;

  @IsOptional()
  @IsString()
  DEV_ADMIN_SECRET?: string;

  // ── GTIN Embedding Match (Pass G) Configuration ──
  @IsOptional()
  @IsIn(['true', 'false'])
  GTIN_EMBEDDING_ENABLED?: string;

  @IsOptional()
  @IsString()
  GTIN_EMBEDDING_MODEL?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  GTIN_EMBEDDING_DIM?: number;

  @IsOptional()
  @IsString()
  GTIN_EMBEDDING_TASK_TYPE?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  GTIN_EMBEDDING_TOPK?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  GTIN_EMBEDDING_AUTO_APPLY_COSINE?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  GTIN_EMBEDDING_VERIFIER_FLOOR_COSINE?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  GTIN_EMBEDDING_BATCH_SIZE?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  GTIN_EMBEDDING_CONCURRENCY?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  GTIN_EMBEDDING_DAILY_BUDGET?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  GTIN_EMBEDDING_REQUEST_TIMEOUT_MS?: number;

  // ── Ollama (Local LLM for GTIN Backfill) ──
  @IsOptional()
  @IsIn(['google', 'ollama'])
  GTIN_AI_PROVIDER?: string;

  @IsOptional()
  @IsIn(['google', 'ollama'])
  GTIN_EMBEDDING_PROVIDER?: string;

  @IsOptional()
  @IsString()
  OLLAMA_BASE_URL?: string;

  @IsOptional()
  @IsString()
  OLLAMA_GTIN_MATCH_MODEL?: string;

  @IsOptional()
  @IsString()
  OLLAMA_GTIN_MATCH_FALLBACK_MODEL?: string;

  @IsOptional()
  @IsString()
  OLLAMA_EMBEDDING_MODEL?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  OLLAMA_REQUEST_TIMEOUT_MS?: number;

  @IsOptional()
  @IsString()
  OLLAMA_KEEP_ALIVE?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  OLLAMA_MAX_RETRIES?: number;

  @IsOptional()
  @IsString()
  CLEAN_STALE_JOBS_ON_STARTUP?: string;
}


export function validate(config: Record<string, any>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed: ${errors.toString()}`);
  }

  // Post-validation: check Vertex fields only if GTIN_AI_ENABLE_VERTEX=true or LLM_PROVIDER=vertex
  if (config.GTIN_AI_ENABLE_VERTEX === 'true' || config.LLM_PROVIDER === 'vertex') {
    if (!config.GOOGLE_APPLICATION_CREDENTIALS || config.GOOGLE_APPLICATION_CREDENTIALS.trim() === '') {
      throw new Error(
        'Vertex AI enabled (GTIN_AI_ENABLE_VERTEX=true or LLM_PROVIDER=vertex) requires GOOGLE_APPLICATION_CREDENTIALS to be set.',
      );
    }
    if (!config.VERTEX_PROJECT_ID || config.VERTEX_PROJECT_ID.trim() === '') {
      throw new Error(
        'Vertex AI enabled (GTIN_AI_ENABLE_VERTEX=true or LLM_PROVIDER=vertex) requires VERTEX_PROJECT_ID to be set.',
      );
    }
    if (!config.VERTEX_LOCATION || config.VERTEX_LOCATION.trim() === '') {
      throw new Error(
        'Vertex AI enabled (GTIN_AI_ENABLE_VERTEX=true or LLM_PROVIDER=vertex) requires VERTEX_LOCATION to be set.',
      );
    }
  }

  // Post-validation: GEMINI_API_KEY is required unless both providers are Ollama
  const aiProvider = config.GTIN_AI_PROVIDER ?? 'google';
  const embeddingProvider = config.GTIN_EMBEDDING_PROVIDER ?? 'google';
  if (aiProvider !== 'ollama' || embeddingProvider !== 'ollama') {
    if (!config.GEMINI_API_KEY || config.GEMINI_API_KEY.trim() === '') {
      throw new Error(
        'GEMINI_API_KEY is required unless both GTIN_AI_PROVIDER=ollama and GTIN_EMBEDDING_PROVIDER=ollama.',
      );
    }
  }

  return validatedConfig;
}
