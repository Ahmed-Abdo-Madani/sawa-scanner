import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import robotsParser from 'robots-parser';

@Injectable()
export class RobotsTxtService {
  private readonly logger = new Logger(RobotsTxtService.name);
  private readonly cache = new Map<string, any>();

  async isAllowed(url: string): Promise<boolean> {
    try {
      const parsedUrl = new URL(url);
      const domain = `${parsedUrl.protocol}//${parsedUrl.host}`;
      const robotsUrl = `${domain}/robots.txt`;

      let parser = this.cache.get(domain);

      if (!parser) {
        this.logger.debug(`Fetching robots.txt for ${domain}`);
        try {
          const response = await axios.get(robotsUrl, { timeout: 5000 });
          parser = robotsParser(robotsUrl, response.data);
        } catch (error) {
          this.logger.warn(`Could not fetch robots.txt from ${robotsUrl}, assuming allowed. Error: ${error.message}`);
          // Create a dummy parser that allows everything if we can't find robots.txt
          parser = robotsParser(robotsUrl, 'User-agent: *\nAllow: /');
        }
        this.cache.set(domain, parser);
      }

      const allowed = parser.isAllowed(url, '*');
      if (!allowed) {
        this.logger.warn(`Skipping disallowed path per robots.txt: ${url}`);
      }
      return allowed;
    } catch (error) {
      this.logger.error(`Error checking robots.txt for ${url}: ${error.message}`);
      return true; // Default to allowed on error to avoid blocking valid runs
    }
  }
}
