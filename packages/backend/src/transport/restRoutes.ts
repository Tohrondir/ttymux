import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  PORT_NOTE_COLORS,
  type ApiErrorResponse,
  type CreatePortNoteRequest,
  type GetPortResponse,
  type GetPortsResponse,
  type GetServerInfoResponse,
  type HealthResponse,
  type PortId,
  type PortInfo,
  type UpdatePortRequest,
} from '@ttymux/shared';
import { buildPortInfo, listAllPortInfo } from './portInfo.js';
import type { TransportDeps } from './types.js';

const VERSION = '0.1.0';

const updatePortRequestSchema = z.object({
  name: z.string().max(200).nullable().optional(),
  group: z.string().max(200).nullable().optional(),
});

const createPortNoteRequestSchema = z.object({
  text: z.string().trim().min(1, 'Note text is required').max(500),
  color: z.enum(PORT_NOTE_COLORS),
  author: z.string().trim().max(100).optional(),
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
    ports: listAllPortInfo(deps.serialManager, deps.sessionHub, deps.portOverrides, deps.portNotes),
  }));

  fastify.get<{ Params: { id: string } }>('/api/ports/:id', async (request, reply) => {
    const port = buildPortInfo(request.params.id, deps.serialManager, deps.sessionHub, deps.portOverrides, deps.portNotes);
    if (!port) {
      const body: ApiErrorResponse = { error: 'not_found', message: `Unknown port id: ${request.params.id}` };
      await reply.code(404).send(body);
      return;
    }
    const body: GetPortResponse = { port };
    return body;
  });

  fastify.get<{ Params: { id: string } }>('/api/ports/:id/log', async (request, reply) => {
    const { id } = request.params;
    if (!deps.serialManager.getDescriptor(id)) {
      const body: ApiErrorResponse = { error: 'not_found', message: `Unknown port id: ${id}` };
      await reply.code(404).send(body);
      return;
    }

    const result = deps.logWriter.createLogReadStream(id);
    if (!result) {
      const body: ApiErrorResponse = {
        error: 'not_found',
        message: 'No log file available for this port yet (logging may be disabled, or nothing has been captured).',
      };
      await reply.code(404).send(body);
      return;
    }

    reply.header('Content-Disposition', `attachment; filename="${result.filename}"`);
    reply.type('application/octet-stream');
    return reply.send(result.stream);
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

    deps.portOverrides.update(id, parsed.data);

    const body: GetPortResponse = { port: broadcastPortChange(deps, id) };
    return body;
  });

  fastify.post<{ Params: { id: string }; Body: CreatePortNoteRequest }>('/api/ports/:id/notes', async (request, reply) => {
    const { id } = request.params;

    if (!deps.serialManager.getDescriptor(id)) {
      const body: ApiErrorResponse = { error: 'not_found', message: `Unknown port id: ${id}` };
      await reply.code(404).send(body);
      return;
    }

    const parsed = createPortNoteRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      const body: ApiErrorResponse = { error: 'invalid_request', message: parsed.error.issues[0]?.message ?? 'Invalid request body' };
      await reply.code(400).send(body);
      return;
    }

    deps.portNotes.add(id, { ...parsed.data, author: parsed.data.author || undefined });

    const body: GetPortResponse = { port: broadcastPortChange(deps, id) };
    return body;
  });

  fastify.delete<{ Params: { id: string; noteId: string } }>('/api/ports/:id/notes/:noteId', async (request, reply) => {
    const { id, noteId } = request.params;

    if (!deps.serialManager.getDescriptor(id)) {
      const body: ApiErrorResponse = { error: 'not_found', message: `Unknown port id: ${id}` };
      await reply.code(404).send(body);
      return;
    }

    if (!deps.portNotes.remove(id, noteId)) {
      const body: ApiErrorResponse = { error: 'not_found', message: `Unknown note id: ${noteId}` };
      await reply.code(404).send(body);
      return;
    }

    const body: GetPortResponse = { port: broadcastPortChange(deps, id) };
    return body;
  });
}

/** Pushes a port's fresh PortInfo to both its console viewers and the dashboard-wide channel, so no open view goes stale. */
function broadcastPortChange(deps: TransportDeps, portId: PortId): PortInfo {
  const port = buildPortInfo(portId, deps.serialManager, deps.sessionHub, deps.portOverrides, deps.portNotes)!;
  deps.sessionHub.broadcastStatus(portId, port);
  deps.broadcaster.broadcast({ type: 'portStatusChanged', port });
  return port;
}
