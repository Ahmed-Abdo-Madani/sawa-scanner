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

  @IsString()
  @IsNotEmpty()
  GOOGLE_APPLICATION_CREDENTIALS: string;

  @IsString()
  @IsNotEmpty()
  GEMINI_API_KEY: string;

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
  return validatedConfig;
}
