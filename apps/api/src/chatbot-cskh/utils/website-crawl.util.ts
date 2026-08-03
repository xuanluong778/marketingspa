export class CrawlFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CrawlFetchError';
  }
}

export class CrawlValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CrawlValidationError';
  }
}

export function chunkWebsiteContent(..._args: any[]): any {
  return null;
}

export function fetchAndExtractUrl(..._args: any[]): any {
  return null;
}
