import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { ConsoleClientMessage, ConsoleServerMessage } from '@ttymux/shared';
import type { ClientHandle } from '../session/SessionHub.js';
import { buildPortInfo } from './portInfo.js';
import type { TransportDeps } from './types.js';

export function registerConsoleRoute(fastify: FastifyInstance, deps: TransportDeps): void {
  fastify.get<{ Params: { portId: string } }>('/ws/console/:portId', { websocket: true }, (socket, request) => {
    const { portId } = request.params;
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

    if (!deps.serialManager.getDescriptor(portId)) {
      socket.close(4404, `Unknown port id: ${portId}`);
      return;
    }

    // Prefer the client-supplied id so the browser can recognize itself in
    // `viewers`/`writeToken` (e.g. "is this tab the current writer?") without
    // the server needing a dedicated "here's your id" message.
    const clientId = query.clientId || randomUUID();
    const client: ClientHandle = {
      clientId,
      displayName: query.name || undefined,
      send: (message: ConsoleServerMessage) => {
        if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
      },
    };

    deps.sessionHub.attach(portId, client);

    const scrollback = deps.serialManager.getScrollback(portId);
    if (scrollback.length > 0) {
      client.send({ type: 'scrollback', dataBase64: scrollback.toString('base64') });
    }

    const info = buildPortInfo(portId, deps.serialManager, deps.sessionHub, deps.portOverrides);
    if (info) client.send({ type: 'status', port: info });

    socket.on('message', (raw: Buffer) => {
      let message: ConsoleClientMessage;
      try {
        message = JSON.parse(raw.toString('utf8'));
      } catch {
        client.send({ type: 'error', message: 'Malformed message' });
        return;
      }
      handleClientMessage(portId, clientId, client, message, deps);
    });

    socket.on('close', () => {
      deps.sessionHub.detach(portId, clientId);
    });
  });
}

function handleClientMessage(
  portId: string,
  clientId: string,
  client: ClientHandle,
  message: ConsoleClientMessage,
  deps: TransportDeps,
): void {
  switch (message.type) {
    case 'hello':
      client.displayName = message.displayName;
      break;

    case 'input': {
      if (!deps.sessionHub.canWrite(portId, clientId)) return;
      deps.serialManager.write(portId, Buffer.from(message.dataBase64, 'base64'));
      break;
    }

    case 'requestControl':
      deps.sessionHub.requestControl(portId, clientId);
      break;

    case 'releaseControl':
      deps.sessionHub.releaseControl(portId, clientId);
      break;

    case 'changeSettings': {
      if (!deps.sessionHub.canWrite(portId, clientId)) {
        client.send({ type: 'controlDenied', reason: 'Only the current writer can change settings' });
        return;
      }
      deps.serialManager.changeSettings(portId, message.settings);
      break;
    }

    case 'setFreeForAll':
      deps.sessionHub.setFreeForAll(portId, message.enabled);
      break;

    case 'ping':
      client.send({ type: 'pong' });
      break;
  }
}
