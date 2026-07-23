#!/usr/bin/env node
import { createInterface } from 'node:readline/promises';
import { Command } from 'commander';
import { hashPassword } from './auth/password.js';
import { loadConfig } from './config/loadConfig.js';
import { startServer } from './server.js';

const program = new Command();
program.name('ttymux').description('Multi-user web dashboard for serial console connections').version('0.1.0');

program
  .command('start', { isDefault: true })
  .description('Start the ttymux server (default command)')
  .option('-c, --config <path>', 'Path to a YAML config file')
  .option('-p, --port <port>', 'Port to listen on', (value) => parseInt(value, 10))
  .option('--host <host>', 'Host/address to bind to')
  .action(async (opts: { config?: string; port?: number; host?: string }) => {
    const { config, sourcePath } = loadConfig(opts.config);
    if (opts.port) config.server.port = opts.port;
    if (opts.host) config.server.host = opts.host;

    const handle = await startServer(config);
    const configNote = sourcePath ? `config: ${sourcePath}` : 'no config file, zero-config defaults';
    console.log(`ttymux listening on http://${handle.host}:${handle.port} (${configNote})`);

    const shutdown = async () => {
      await handle.close();
      process.exit(0);
    };
    process.on('SIGINT', () => void shutdown());
    process.on('SIGTERM', () => void shutdown());
  });

program
  .command('hash-password')
  .description('Hash a password for auth.users (mode: basic) in the config file')
  .action(async () => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    console.log('Note: input is not masked on screen.');
    const password = await rl.question('Password to hash: ');
    rl.close();
    console.log(hashPassword(password));
  });

await program.parseAsync(process.argv);
