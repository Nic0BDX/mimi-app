import type { IncomingMessage, ServerResponse } from 'node:http';
import { buildApp } from './app.js';
import { envSchema } from './config/env.js';

let application: ReturnType<typeof buildApp> | undefined;
export default async function handler(request: IncomingMessage, response: ServerResponse) {
  try {
    application ??= buildApp(envSchema.parse(process.env), { accountsOnly: true }).catch(
      (error: unknown) => {
        application = undefined;
        throw error;
      },
    );
    const app = await application;
    await app.ready();
    app.server.emit('request', request, response);
  } catch (error) {
    console.error(
      'ACCOUNTS_BOOTSTRAP_FAILED',
      error instanceof Error ? error.name : 'UnknownError',
    );
    response.statusCode = 503;
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('Cache-Control', 'no-store');
    response.end(JSON.stringify({ error: { code: 'API_UNAVAILABLE' } }));
  }
}
