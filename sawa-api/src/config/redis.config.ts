import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';

const logger = new Logger('RedisConfig');

/**
 * Generates Redis connection options for BullMQ/Redis based on ConfigService.
 * This centralizes auth, username sanitization, and TLS settings.
 */
export const getRedisOptions = (config: ConfigService) => {
  const host = config.get<string>('REDIS_HOST');
  const port = config.get<number>('REDIS_PORT');
  const user = config.get<string>('REDIS_USERNAME');
  const password = config.get<string>('REDIS_PASSWORD');
  const useTls = config.get<string>('REDIS_TLS') === 'true';

  // Log configuration state (without secrets) to aid debugging
  logger.log(`Configuring Redis at ${host}:${port} (TLS: ${useTls ? 'Enabled' : 'Disabled'})`);

  return {
    host,
    port,
    // Redis 6+ requirement: if username is 'default', BullMQ/ioredis often works better with undefined,
    // as it signals the default ACL user.
    username: user === 'default' ? undefined : user,
    password,
    tls: useTls ? {} : undefined,
    maxRetriesPerRequest: null, // Critical requirement for BullMQ
    retryStrategy: (times: number) => {
      // Exponential backoff with a cap
      const delay = Math.min(times * 50, 2000);
      if (times % 10 === 0) {
        logger.warn(`Redis reconnection attempt #${times}...`);
      }
      return delay;
    },
  };
};
