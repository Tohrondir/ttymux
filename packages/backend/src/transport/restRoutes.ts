import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ApiErrorResponse, GetPortResponse, GetPortsResponse, GetServerInfoResponse, HealthResponse, UpdatePortRequest } from '@ttymux/shared';
import { buildPortInfo, listAllPortInfo } from './portInfo.js';
import type { TransportDeps } from './types.js';

const VERSION = '0.1.0';

const updatePortRequestSchema = z.object({
  name: z.string().max(200).nullable().optional(),
  group: z.string().max(200).nullable().optional(),
});

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

  fastify.patch<{ Params: { id: string }; Body: UpdatePortRequest }>('/api/ports/:id', async (request, reply) => {
    const { id } = request.params;

    if (!deps.serialManager.getDescriptor(id)) {
      const body: ApiErrorResponse = { error: 'not_found', message: `Unknown port id: ${id}` };
      await reply.code(404).send(body);
      return;
    }

    const parsed = updatePortRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      const body: ApiErrorResponse = { error: 'invalid_request', message: parsed.error.issues[0]?.message ?? 'Invalid request body' };
      await reply.code(400).send(body);
      return;
    }

    const override = { ...deps.portOverrides[id] };
    applyOverrideField(override, 'name', parsed.data.name);
    applyOverrideField(override, 'group', parsed.data.group);
    deps.portOverrides[id] = override;

    const port = buildPortInfo(id, deps.serialManager, deps.sessionHub, deps.portOverrides)!;
    deps.sessionHub.broadcastStatus(id, port);
    deps.broadcaster.broadcast({ type: 'portStatusChanged', port });

    const body: GetPortResponse = { port };
    return body;
  });
}

function applyOverrideField<K extends 'name' | 'group'>(
  override: { name?: string; group?: string },
  key: K,
  value: string | null | undefined,
): void {
  if (value === undefined) return; // omitted -> leave unchanged
  if (value === null || value === '') delete override[key];
  else override[key] = value;
}
