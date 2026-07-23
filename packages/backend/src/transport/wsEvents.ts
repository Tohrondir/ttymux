import type { FastifyInstance } from 'fastify';
import type { TransportDeps } from './types.js';

export function registerEventsRoute(fastify: FastifyInstance, deps: TransportDeps): void {
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
