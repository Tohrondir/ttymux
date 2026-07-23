import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import { DEFAULT_SERIAL_SETTINGS } from '@ttymux/shared';
import { createAuthProvider } from './auth/AuthProvider.js';
import type { ResolvedConfig } from './config/loadConfig.js';
import { LogWriter } from './logging/LogWriter.js';
import { PortRegistry } from './registry/PortRegistry.js';
import { listRawPorts } from './registry/discovery.js';
import { SerialManager } from './serial/SerialManager.js';
import { SessionHub } from './session/SessionHub.js';
import { EventsBroadcaster } from './transport/EventsBroadcaster.js';
import { buildPortInfo } from './transport/portInfo.js';
import { registerRestRoutes } from './transport/restRoutes.js';
import { registerEventsRoute } from './transport/wsEvents.js';
import { registerConsoleRoute } from './transport/wsConsole.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface ServerHandle {
  close(): Promise<void>;
  port: number;
  host: string;
}

export async function startServer(config: ResolvedConfig): Promise<ServerHandle> {
  const fastify = Fastify({ logger: true });
  await fastify.register(fastifyWebsocket);

  const registry = new PortRegistry(2000, () => listRawPorts({ includeLegacyPorts: config.discovery.includeLegacyPorts }));
  const serialManager = new SerialManager({
    scrollbackBytes: config.scrollback.bytes,
    defaultSettings: (portId) => ({ ...DEFAULT_SERIAL_SETTINGS, ...config.ports[portId]?.defaultSettings }),
  });
  const sessionHub = new SessionHub();
  const logWriter = new LogWriter(config.logging);
  const authProvider = createAuthProvider(config.auth);
  const broadcaster = new EventsBroadcaster();

  const deps = {
    serialManager,
    sessionHub,
    authProvider,
    authMode: config.auth.mode,
    portOverrides: config.ports,
    broadcaster,
  };

  registry.on('added', (descriptor) => {
    serialManager.handlePortAdded(descriptor);
    const info = buildPortInfo(descriptor.id, serialManager, sessionHub, config.ports);
    if (info) broadcaster.broadcast({ type: 'portAdded', port: info });
  });

  registry.on('removed', (portId) => {
    // Marks the port offline rather than deleting it. The SerialManager 'status'
    // listener below broadcasts the resulting change. Ports persist as offline so
    // they're still visible (and remembered) across a replug.
    serialManager.handlePortRemoved(portId);
  });

  serialManager.on('data', (portId, chunk) => {
    logWriter.append(portId, chunk);
    sessionHub.fanOutData(portId, chunk);
  });

  serialManager.on('status', (portId) => {
    const info = buildPortInfo(portId, serialManager, sessionHub, config.ports);
    if (!info) return;
    sessionHub.broadcastStatus(portId, info);
    broadcaster.broadcast({ type: 'portStatusChanged', port: info });
  });

  // Viewer count and write-token changes don't go through SerialManager, so
  // they need their own path to reach the dashboard's live view.
  sessionHub.on('changed', (portId) => {
    const info = buildPortInfo(portId, serialManager, sessionHub, config.ports);
    if (info) broadcaster.broadcast({ type: 'portStatusChanged', port: info });
  });

  registerRestRoutes(fastify, deps);
  registerEventsRoute(fastify, deps);
  registerConsoleRoute(fastify, deps);

  const frontendDist = resolve(__dirname, '../../frontend/dist');
  if (existsSync(frontendDist)) {
    await fastify.register(fastifyStatic, { root: frontendDist });
    fastify.setNotFoundHandler((request, reply) => {
      if (request.raw.url?.startsWith('/api/') || request.raw.url?.startsWith('/ws/')) {
        reply.code(404).send({ error: 'not_found', message: 'Not found' });
        return;
      }
      reply.sendFile('index.html');
    });
  } else {
    fastify.log.warn(
      'No frontend build found at %s, run "npm run build --workspace packages/frontend" to serve the UI from this process.',
      frontendDist,
    );
  }

  await registry.start();

  await fastify.listen({ port: config.server.port, host: config.server.host });

  return {
    port: config.server.port,
    host: config.server.host,
    close: async () => {
      registry.stop();
      serialManager.stop();
      logWriter.closeAll();
      await fastify.close();
    },
  };
}
