export type AuthMode = 'none' | 'token' | 'basic';

export interface BasicAuthUser {
  username: string;
  /** bcrypt hash — never a plaintext password. */
  passwordHash: string;
}

export interface AuthConfig {
  mode: AuthMode;
  /** mode: 'token' — sent as `Authorization: Bearer <token>`, or `?token=` for WebSocket connections (browsers cannot set custom headers on WS upgrade requests). */
  token?: string;
  /** mode: 'basic' */
  users?: BasicAuthUser[];
}
