interface RateLimiterConfig {
  rpm: number;           // requests per minute
  maxConcurrent: number; // max concurrent requests
  maxRetries?: number;   // max retries on failure
}

interface QueueItem<T> {
  fn: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: any) => void;
  retries: number;
}

export class RateLimiter {
  private rpm: number;
  private maxConcurrent: number;
  private maxRetries: number;
  private queue: QueueItem<any>[] = [];
  private activeCount = 0;
  private lastRequestTime = 0;
  private paused = false;
  private pauseTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(config: RateLimiterConfig = { rpm: 10, maxConcurrent: 3 }) {
    this.rpm = config.rpm;
    this.maxConcurrent = config.maxConcurrent;
    this.maxRetries = config.maxRetries ?? 3;
  }

  /**
   * Schedule a function to execute within rate limits.
   */
  async schedule<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ fn, resolve, reject, retries: 0 });
      this.processQueue();
    });
  }

  /**
   * Pause all requests (e.g., after a 429 response).
   * Resumes after the given delay.
   */
  pause(delayMs: number): void {
    this.paused = true;
    if (this.pauseTimeout) clearTimeout(this.pauseTimeout);
    this.pauseTimeout = setTimeout(() => {
      this.paused = false;
      this.processQueue();
    }, delayMs);
  }

  /**
   * Cancel all pending requests.
   */
  cancelAll(): void {
    const pending = this.queue.splice(0);
    pending.forEach(item => item.reject(new Error('Cancelled')));
    if (this.pauseTimeout) {
      clearTimeout(this.pauseTimeout);
      this.pauseTimeout = null;
    }
    this.paused = false;
  }

  get pendingCount(): number {
    return this.queue.length;
  }

  get runningCount(): number {
    return this.activeCount;
  }

  private async processQueue(): Promise<void> {
    if (this.paused) return;
    if (this.activeCount >= this.maxConcurrent) return;
    if (this.queue.length === 0) return;

    // Rate limiting: ensure minimum interval between requests
    const minInterval = 60000 / this.rpm;
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;

    if (elapsed < minInterval) {
      setTimeout(() => this.processQueue(), minInterval - elapsed);
      return;
    }

    const item = this.queue.shift()!;
    this.activeCount++;
    this.lastRequestTime = Date.now();

    try {
      const result = await item.fn();
      item.resolve(result);
    } catch (error: any) {
      // Check if this is a retryable error and we haven't exceeded retries
      if (error?.name === 'RateLimitError' && item.retries < this.maxRetries) {
        item.retries++;
        // Re-queue at the front for retry after pause
        this.queue.unshift(item);
        // Exponential backoff: 2^retries seconds
        this.pause(Math.pow(2, item.retries) * 1000);
      } else {
        item.reject(error);
      }
    } finally {
      this.activeCount--;
      this.processQueue();
    }
  }
}
