import { z } from 'zod';

const serialSettingsPartialSchema = z
  .object({
    baudRate: z.number().int().positive(),
    dataBits: z.union([z.literal(5), z.literal(6), z.literal(7), z.literal(8)]),
    stopBits: z.union([z.literal(1), z.literal(1.5), z.literal(2)]),
    parity: z.enum(['none', 'even', 'odd', 'mark', 'space']),
    flowControl: z.enum(['none', 'rts/cts', 'xon/xoff']),
  })
  .partial();

const portOverrideSchema = z.object({
  name: z.string().optional(),
  group: z.string().optional(),
  defaultSettings: serialSettingsPartialSchema.optional(),
  hidden: z.boolean().optional(),
});

const authConfigSchema = z.object({
  mode: z.enum(['none', 'token', 'basic']),
  token: z.string().optional(),
  users: z
    .array(z.object({ username: z.string(), passwordHash: z.string() }))
    .optional(),
});

export const configSchema = z.object({
  server: z
    .object({
      port: z.number().int().positive().optional(),
      host: z.string().optional(),
    })
    .optional(),
  auth: authConfigSchema.optional(),
  logging: z
    .object({
      enabled: z.boolean().optional(),
      directory: z.string().optional(),
      maxSizeMb: z.number().positive().optional(),
      maxFiles: z.number().int().positive().optional(),
    })
    .optional(),
  scrollback: z
    .object({
      bytes: z.number().int().positive().optional(),
    })
    .optional(),
  ports: z.record(portOverrideSchema).optional(),
});

export type ValidatedConfig = z.infer<typeof configSchema>;
