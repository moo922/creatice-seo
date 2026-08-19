import { Logger } from '@nestjs/common';

/**
 * Circuit Breaker — prevents cascading failures by temporarily pausing
 * calls to a failing provider/service.
 *
 * States:
 *   CLOSED — normal operation, requests pass through
 *   OPEN — provider is failing, requests are rejected immediately
 *   HALF_OPEN — testing if provider recovered, one probe request allowed
 *
 * Configuration:
 *   failureThreshold — consecutive failures to trip the breaker
 *   recoveryTimeout — ms to wait before attempting recovery
 *   successThreshold — consecutive successes in HALF_OPEN to close
 */

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeoutMs: number;
  successThreshold: number;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  recoveryTimeoutMs: 60_000,
  successThreshold: 2,
};

export class CircuitBreaker {
  private readonly logger = new Logger(CircuitBreaker.name);
  private state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  private readonly config: CircuitBreakerConfig;

  constructor(
    private readonly name: string,
    config?: Partial<CircuitBreakerConfig>,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  getState(): CircuitState {
    if (this.state === 'OPEN') {
      // Check if recovery timeout has elapsed
      if (Date.now() - this.lastFailureTime >= this.config.recoveryTimeoutMs) {
        this.state = 'HALF_OPEN';
        this.successCount = 0;
        this.logger.log(`Circuit breaker "${this.name}" transitioning from OPEN to HALF_OPEN`);
      }
    }
    return this.state;
  }

  /**
   * Check if a request is allowed through.
   */
  allowRequest(): boolean {
    const state = this.getState();
    if (state === 'CLOSED') return true;
    if (state === 'HALF_OPEN') return true; // Allow one probe
    return false; // OPEN — reject
  }

  /**
   * Record a successful call.
   */
  recordSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= this.config.successThreshold) {
        this.state = 'CLOSED';
        this.failureCount = 0;
        this.successCount = 0;
        this.logger.log(`Circuit breaker "${this.name}" recovered — CLOSED`);
      }
    } else {
      this.failureCount = 0;
    }
  }

  /**
   * Record a failed call.
   */
  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === 'HALF_OPEN') {
      // Failed during probe — back to OPEN
      this.state = 'OPEN';
      this.successCount = 0;
      this.logger.warn(`Circuit breaker "${this.name}" probe failed — back to OPEN`);
    } else if (this.failureCount >= this.config.failureThreshold) {
      this.state = 'OPEN';
      this.logger.warn(`Circuit breaker "${this.name}" tripped — OPEN after ${this.failureCount} failures`);
    }
  }

  /**
   * Force reset to CLOSED state.
   */
  reset(): void {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
  }

  /**
   * Get current metrics for observability.
   */
  getMetrics(): { state: CircuitState; failureCount: number; successCount: number; name: string } {
    return {
      state: this.getState(),
      failureCount: this.failureCount,
      successCount: this.successCount,
      name: this.name,
    };
  }
}

/**
 * Registry of circuit breakers for different providers/services.
 */
export class CircuitBreakerRegistry {
  private readonly breakers = new Map<string, CircuitBreaker>();

  getOrCreate(name: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
    let breaker = this.breakers.get(name);
    if (!breaker) {
      breaker = new CircuitBreaker(name, config);
      this.breakers.set(name, breaker);
    }
    return breaker;
  }

  getAll(): CircuitBreaker[] {
    return Array.from(this.breakers.values());
  }

  getMetrics(): Array<{ name: string; state: CircuitState; failureCount: number; successCount: number }> {
    return this.getAll().map((b) => b.getMetrics());
  }
}
