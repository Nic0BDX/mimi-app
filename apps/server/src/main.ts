import { envSchema } from './config/env.js';
import { buildApp } from './app.js';

const env = envSchema.parse(process.env);
const app = await buildApp(env);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    void app.close().then(() => process.exit(0));
  });
await app.listen({ host: env.HOST, port: env.PORT });
