import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import robotsParser from 'robots-parser';

@Injectable()
export class RobotsTxtService {
  private readonly logger = new Logger(RobotsTxtService.name);
  private readonly cache = new Map<
    string,
    { parser: any; fetchedAt: number }
  >();
  private readonly TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

  async isAllowed(url: string): Promise<boolean> {
    if (process.env.BYPASS_ROBOTS_TXT === 'true') {
      this.logger.log(`Bypassing robots.txt check for: ${url}`);
      return true;
    }
    try {
      const parsedUrl = new URL(url);
      const domain = `${parsedUrl.protocol}//${parsedUrl.host}`;
      const robotsUrl = `${domain}/robots.txt`;

      let entry = this.cache.get(domain);
      const now = Date.now();

      if (!entry || now - entry.fetchedAt > this.TTL_MS) {
        this.logger.debug(`Fetching robots.txt for ${domain}`);
        try {
          const response = await axios.get(robotsUrl, { timeout: 5000 });
          const parser = robotsParser(robotsUrl, response.data);
          entry = { parser, fetchedAt: now };
          this.cache.set(domain, entry);
        } catch (error) {
          this.logger.warn(
            `Could not fetch robots.txt from ${robotsUrl}, assuming allowed. Error: ${error.message}`,
          );
          // Do not cache the fallback parser so we retry next time.
          // Or cache with a very short TTL (e.g., 5 mins) to avoid hammering.
          return true;
        }
      }

      const allowed = entry.parser.isAllowed(url, '*');
      if (!allowed) {
        this.logger.warn(`Skipping disallowed path per robots.txt: ${url}`);
      }
      return allowed;
    } catch (error) {
      this.logger.error(
        `Error checking robots.txt for ${url}: ${error.message}`,
      );
      return true; // Default to allowed on error to avoid blocking valid runs
    }
  }
}
