import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import type { EventsServerMessage } from '@ttymux/shared';
import type { TransportDeps } from './types.js';

/** Fan-out for `/ws/events` subscribers — dashboard-wide port add/remove/status deltas. */
export class EventsBroadcaster {
  private readonly sockets = new Set<WebSocket>();

  subscribe(socket: WebSocket): void {
    this.sockets.add(socket);
  }

  unsubscribe(socket: WebSocket): void {
    this.sockets.delete(socket);
  }

  broadcast(message: EventsServerMessage): void {
    const json = JSON.stringify(message);
    for (const socket of this.sockets) {
      if (socket.readyState === socket.OPEN) socket.send(json);
    }
  }
}

export function registerEventsRoute(fastify: FastifyInstance, deps: TransportDeps & { broadcaster: EventsBroadcaster }): void {
  fastify.get('/ws/events', { websocket: true }, (socket, request) => {
    const query = request.query as Record<string, string | undefined>;
    const auth = deps.authProvider.authenticate({
      remoteAddress: request.ip,
      authorizationHeader: request.headers.authorization,
      tokenQueryParam: query.token,
    });
    if (!auth.ok) {
      socket.close(4401, auth.reason ?? 'Unauthorized');
      return;
    }

    deps.broadcaster.subscribe(socket);
    socket.on('close', () => deps.broadcaster.unsubscribe(socket));
  });
}
