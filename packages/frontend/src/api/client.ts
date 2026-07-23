import type {
  ApiErrorResponse,
  ConsoleClientMessage,
  ConsoleServerMessage,
  EventsServerMessage,
  GetPortResponse,
  GetPortsResponse,
  GetServerInfoResponse,
  PortInfo,
} from '@ttymux/shared';

const TOKEN_STORAGE_KEY = 'ttymux.token';

export class AuthRequiredError extends Error {
  constructor() {
    super('Authentication required');
    this.name = 'AuthRequiredError';
  }
}

let authToken: string | null = sessionStorage.getItem(TOKEN_STORAGE_KEY);

export function getAuthToken(): string | null {
  return authToken;
}

export function setAuthToken(token: string | null): void {
  authToken = token;
  if (token) sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
  else sessionStorage.removeItem(TOKEN_STORAGE_KEY);
}

async function apiFetch<T>(path: string): Promise<T> {
  const headers: Record<string, string> = {};
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  const response = await fetch(path, { headers });

  if (response.status === 401) throw new AuthRequiredError();
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiErrorResponse | null;
    throw new Error(body?.message ?? `Request failed with status ${response.status}`);
  }
  return (await response.json()) as T;
}

export const api = {
  async getPorts(): Promise<PortInfo[]> {
    return (await apiFetch<GetPortsResponse>('/api/ports')).ports;
  },
  async getPort(id: string): Promise<PortInfo> {
    return (await apiFetch<GetPortResponse>(`/api/ports/${encodeURIComponent(id)}`)).port;
  },
  async getServerInfo(): Promise<GetServerInfoResponse> {
    return apiFetch<GetServerInfoResponse>('/api/server-info');
  },
};

function buildWsUrl(path: string, extraParams: Record<string, string> = {}): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = new URL(path, `${protocol}//${window.location.host}`);
  if (authToken) url.searchParams.set('token', authToken);
  for (const [key, value] of Object.entries(extraParams)) url.searchParams.set(key, value);
  return url.toString();
}

const RECONNECT_INITIAL_MS = 500;
const RECONNECT_MAX_MS = 30_000;

function nextReconnectDelay(attempt: number): number {
  return Math.min(RECONNECT_MAX_MS, RECONNECT_INITIAL_MS * 2 ** (attempt - 1));
}

export interface EventsSocketHandlers {
  onMessage: (message: EventsServerMessage) => void;
  onConnectionChange?: (connected: boolean) => void;
}

/** Auto-reconnects with backoff on drop; caller gets a single close() to tear it down for good. */
export function connectEventsSocket(handlers: EventsSocketHandlers): () => void {
  let closedByCaller = false;
  let socket: WebSocket | null = null;
  let attempt = 0;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

  function connect() {
    socket = new WebSocket(buildWsUrl('/ws/events'));
    socket.onopen = () => {
      attempt = 0;
      handlers.onConnectionChange?.(true);
    };
    socket.onmessage = (event) => {
      try {
        handlers.onMessage(JSON.parse(event.data as string) as EventsServerMessage);
      } catch {
        // Ignore malformed frames rather than tearing down the socket.
      }
    };
    socket.onclose = () => {
      handlers.onConnectionChange?.(false);
      if (closedByCaller) return;
      attempt += 1;
      retryTimer = setTimeout(connect, nextReconnectDelay(attempt));
    };
    socket.onerror = () => socket?.close();
  }

  connect();

  return () => {
    closedByCaller = true;
    if (retryTimer) clearTimeout(retryTimer);
    socket?.close();
  };
}

export interface ConsoleSocketHandlers {
  onMessage: (message: ConsoleServerMessage) => void;
  onConnectionChange?: (connected: boolean) => void;
  displayName?: string;
}

export interface ConsoleSocketHandle {
  send(message: ConsoleClientMessage): void;
  close(): void;
}

/** Generate up front (e.g. via `useRef`) so it's known before the socket connects — matches `writeToken.holder`/`viewers[].clientId` to tell whether this tab holds the token. */
export function generateClientId(): string {
  // `crypto.randomUUID()` only works in secure contexts (HTTPS or literally
  // `localhost`) — plain `http://<lan-ip>:9000`, e.g. reaching a host over
  // the network by IP, is not one, and calling it throws. This id only needs
  // to be unique per browser tab, not cryptographically unpredictable, so
  // fall back to `getRandomValues` (which has no such restriction).
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function connectConsoleSocket(portId: string, clientId: string, handlers: ConsoleSocketHandlers): ConsoleSocketHandle {
  let closedByCaller = false;
  let socket: WebSocket | null = null;
  let attempt = 0;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let queued: ConsoleClientMessage[] = [];

  function flushQueue() {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    for (const message of queued) socket.send(JSON.stringify(message));
    queued = [];
  }

  function connect() {
    const params: Record<string, string> = { clientId };
    if (handlers.displayName) params.name = handlers.displayName;
    socket = new WebSocket(buildWsUrl(`/ws/console/${encodeURIComponent(portId)}`, params));
    socket.onopen = () => {
      attempt = 0;
      handlers.onConnectionChange?.(true);
      flushQueue();
    };
    socket.onmessage = (event) => {
      try {
        handlers.onMessage(JSON.parse(event.data as string) as ConsoleServerMessage);
      } catch {
        // Ignore malformed frames rather than tearing down the socket.
      }
    };
    socket.onclose = () => {
      handlers.onConnectionChange?.(false);
      if (closedByCaller) return;
      attempt += 1;
      retryTimer = setTimeout(connect, nextReconnectDelay(attempt));
    };
    socket.onerror = () => socket?.close();
  }

  connect();

  return {
    send(message) {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
      else queued.push(message);
    },
    close() {
      closedByCaller = true;
      if (retryTimer) clearTimeout(retryTimer);
      socket?.close();
    },
  };
}
