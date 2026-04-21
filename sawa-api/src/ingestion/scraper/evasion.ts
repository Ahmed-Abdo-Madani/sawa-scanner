export const USER_AGENTS = [
  // Desktop
  {
    platform: 'desktop',
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  },
  {
    platform: 'desktop',
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  },
  {
    platform: 'desktop',
    ua: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  },
  {
    platform: 'desktop',
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
  },
  {
    platform: 'desktop',
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:122.0) Gecko/20100101 Firefox/122.0',
  },
  {
    platform: 'desktop',
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/121.0.0.0 Safari/537.36',
  },
  {
    platform: 'desktop',
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2.1 Safari/605.1.15',
  },
  // Mobile
  {
    platform: 'mobile',
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
  },
  {
    platform: 'mobile',
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
  },
  {
    platform: 'mobile',
    ua: 'Mozilla/5.0 (Linux; Android 13; SM-S901B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36',
  },
  {
    platform: 'mobile',
    ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Mobile Safari/537.36',
  },
];

export function getRandomUA(platform?: 'mobile' | 'desktop'): string {
  const filtered = platform
    ? USER_AGENTS.filter((u) => u.platform === platform)
    : USER_AGENTS;
  const pool = filtered.length > 0 ? filtered : USER_AGENTS;
  return pool[Math.floor(Math.random() * pool.length)].ua;
}

export async function applyJitter(min = 800, max = 3500): Promise<void> {
  const delay = Math.floor(Math.random() * (max - min + 1) + min);
  return new Promise((resolve) => setTimeout(resolve, delay));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 5,
): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const status = error?.response?.status || error?.status;
      console.warn(
        `[Evasion Retry] Attempt ${attempt + 1}/${maxRetries} failed: ${error.message} (Status: ${status})`,
      );

      // Retry on 429 (Too Many Requests), 500 (Internal Server Error) or 503 (Service Unavailable)
      // or common network errors
      if (status === 429 || status === 500 || status === 503 || !status) {
        const delay = Math.pow(2, attempt) * 2000;
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}
