export interface BackoffOptions {
  initialDelayMs: number;
  maxDelayMs: number;
  factor: number;
  /** Fraction of the capped delay to randomize by, e.g. 0.2 = +/-20%. */
  jitterRatio: number;
}

export const DEFAULT_BACKOFF_OPTIONS: BackoffOptions = {
  initialDelayMs: 500,
  maxDelayMs: 30_000,
  factor: 2,
  jitterRatio: 0.2,
};

/**
 * Exponential backoff delay for reconnect attempt N (1-indexed), with jitter
 * to avoid many ports/clients retrying in lockstep. Pure function so tests
 * can assert on it deterministically by injecting `random`.
 */
export function computeBackoffDelay(
  attempt: number,
  opts: BackoffOptions = DEFAULT_BACKOFF_OPTIONS,
  random: () => number = Math.random,
): number {
  const clampedAttempt = Math.max(1, attempt);
  const raw = opts.initialDelayMs * Math.pow(opts.factor, clampedAttempt - 1);
  const capped = Math.min(raw, opts.maxDelayMs);
  const jitter = capped * opts.jitterRatio * (random() * 2 - 1);
  return Math.max(0, Math.round(capped + jitter));
}
