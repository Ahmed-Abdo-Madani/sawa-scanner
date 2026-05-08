/**
 * Transient Provider Failure Exception
 * Thrown when a provider exhausts retries on transient errors (e.g., 503 Service Unavailable).
 * Signals to the orchestrator that the next provider should be tried.
 */
export class TransientProviderFailureException extends Error {
  constructor(
    message: string = 'Transient provider failure; failover to next provider',
    public readonly providerName?: string,
    public readonly originalError?: any,
  ) {
    super(message);
    this.name = 'TransientProviderFailureException';
  }
}
