import type { FastifyInstance } from 'fastify';
import type { ApiErrorResponse, GetPortResponse, GetPortsResponse, GetServerInfoResponse, HealthResponse } from '@ttymux/shared';
import { buildPortInfo, listAllPortInfo } from './portInfo.js';
import type { TransportDeps } from './types.js';

const VERSION = '0.1.0';

export function registerRestRoutes(fastify: FastifyInstance, deps: TransportDeps): void {
  fastify.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/api/')) return;
    const result = deps.authProvider.authenticate({
      remoteAddress: request.ip,
      authorizationHeader: request.headers.authorization,
    });
    if (!result.ok) {
      const body: ApiErrorResponse = { error: 'unauthorized', message: result.reason ?? 'Authentication required' };
      await reply.code(401).send(body);
    }
  });

  fastify.get('/api/health', async (): Promise<HealthResponse> => ({ ok: true }));

  fastify.get('/api/server-info', async (): Promise<GetServerInfoResponse> => ({
    version: VERSION,
    authMode: deps.authMode,
    platform: process.platform,
  }));

  fastify.get('/api/ports', async (): Promise<GetPortsResponse> => ({
    ports: listAllPortInfo(deps.serialManager, deps.sessionHub, deps.portOverrides),
  }));

  fastify.get<{ Params: { id: string } }>('/api/ports/:id', async (request, reply) => {
    const port = buildPortInfo(request.params.id, deps.serialManager, deps.sessionHub, deps.portOverrides);
    if (!port) {
      const body: ApiErrorResponse = { error: 'not_found', message: `Unknown port id: ${request.params.id}` };
      await reply.code(404).send(body);
      return;
    }
    const body: GetPortResponse = { port };
    return body;
  });
}
