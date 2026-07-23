import { describe, expect, it } from 'vitest';
import { computeBackoffDelay, type BackoffOptions } from '../src/serial/backoff.js';

const opts: BackoffOptions = { initialDelayMs: 100, maxDelayMs: 1000, factor: 2, jitterRatio: 0 };

describe('computeBackoffDelay', () => {
  it('grows exponentially with attempt number, with no jitter', () => {
    expect(computeBackoffDelay(1, opts)).toBe(100);
    expect(computeBackoffDelay(2, opts)).toBe(200);
    expect(computeBackoffDelay(3, opts)).toBe(400);
    expect(computeBackoffDelay(4, opts)).toBe(800);
  });

  it('caps the delay at maxDelayMs', () => {
    expect(computeBackoffDelay(10, opts)).toBe(1000);
  });

  it('treats attempt numbers below 1 as attempt 1', () => {
    expect(computeBackoffDelay(0, opts)).toBe(100);
    expect(computeBackoffDelay(-5, opts)).toBe(100);
  });

  it('applies jitter within the configured ratio', () => {
    const jittered: BackoffOptions = { ...opts, jitterRatio: 0.2 };
    expect(computeBackoffDelay(1, jittered, () => 1)).toBe(120);
    expect(computeBackoffDelay(1, jittered, () => 0)).toBe(80);
  });
});
