import type { AuthConfig } from '@ttymux/shared';
import { verifyPassword } from './password.js';

export interface AuthRequestContext {
  remoteAddress?: string;
  /** Raw `Authorization` header value, e.g. "Bearer xyz" or "Basic base64(...)". */
  authorizationHeader?: string;
  /** `?token=` query param — WebSocket handshakes can't set custom headers from a browser. */
  tokenQueryParam?: string;
}

export interface AuthResult {
  ok: boolean;
  reason?: string;
  identity?: string;
}

export interface AuthProvider {
  authenticate(ctx: AuthRequestContext): AuthResult;
}

class NoneAuthProvider implements AuthProvider {
  authenticate(): AuthResult {
    return { ok: true, identity: 'anonymous' };
  }
}

class TokenAuthProvider implements AuthProvider {
  constructor(private readonly token: string) {}

  authenticate(ctx: AuthRequestContext): AuthResult {
    const bearer = ctx.authorizationHeader?.match(/^Bearer\s+(.+)$/i)?.[1];
    const supplied = bearer ?? ctx.tokenQueryParam;
    if (supplied && supplied === this.token) return { ok: true, identity: 'token' };
    return { ok: false, reason: 'Missing or invalid token' };
  }
}

class BasicAuthProvider implements AuthProvider {
  constructor(private readonly users: { username: string; passwordHash: string }[]) {}

  authenticate(ctx: AuthRequestContext): AuthResult {
    const match = ctx.authorizationHeader?.match(/^Basic\s+(.+)$/i)?.[1];
    if (!match) return { ok: false, reason: 'Missing credentials' };

    const decoded = Buffer.from(match, 'base64').toString('utf8');
    const separatorIndex = decoded.indexOf(':');
    if (separatorIndex === -1) return { ok: false, reason: 'Malformed credentials' };

    const username = decoded.slice(0, separatorIndex);
    const password = decoded.slice(separatorIndex + 1);
    const user = this.users.find((u) => u.username === username);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return { ok: false, reason: 'Invalid username or password' };
    }
    return { ok: true, identity: username };
  }
}

/**
 * Wraps a mode-specific provider with a loopback bypass: connections from
 * 127.0.0.1/::1 are always authenticated, regardless of configured mode.
 * This is what makes the zero-config default (mode: 'none', host: loopback)
 * safe, and keeps local access convenient even once network exposure with
 * auth has been configured.
 */
class LoopbackBypassAuthProvider implements AuthProvider {
  constructor(private readonly inner: AuthProvider) {}

  authenticate(ctx: AuthRequestContext): AuthResult {
    if (isLoopbackAddress(ctx.remoteAddress)) return { ok: true, identity: 'loopback' };
    return this.inner.authenticate(ctx);
  }
}

export function isLoopbackAddress(address: string | undefined): boolean {
  if (!address) return false;
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1' || address.startsWith('127.');
}

export function createAuthProvider(config: AuthConfig): AuthProvider {
  let inner: AuthProvider;
  switch (config.mode) {
    case 'none':
      inner = new NoneAuthProvider();
      break;
    case 'token':
      if (!config.token) throw new Error("auth.mode is 'token' but no auth.token was configured");
      inner = new TokenAuthProvider(config.token);
      break;
    case 'basic':
      if (!config.users?.length) throw new Error("auth.mode is 'basic' but no auth.users were configured");
      inner = new BasicAuthProvider(config.users);
      break;
    default:
      inner = new NoneAuthProvider();
  }
  return new LoopbackBypassAuthProvider(inner);
}
