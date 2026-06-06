import Fastify from 'fastify';
import sensible from '@fastify/sensible';
import cors from '@fastify/cors';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { initOraclePool, closeOraclePool } from './config/oracle.js';
import { mobilePaymentsRoutes } from './routes/v1/payments.js';
import { mobileTokensRoutes } from './routes/v1/tokens.js';
import { internalPaymentsRoutes } from './routes/internal/payments.js';

async function buildApp() {
  const app = Fastify({
    loggerInstance: logger,
    disableRequestLogging: env.NODE_ENV === 'production',
    bodyLimit: 1_048_576,
  });

  await app.register(sensible);
  await app.register(cors, { origin: true, credentials: false });

  app.get('/health', async () => ({ status: 'ok', ts: new Date().toISOString() }));

  await app.register(mobilePaymentsRoutes, { prefix: '/v1/payments' });
  await app.register(mobileTokensRoutes, { prefix: '/v1/tokens' });
  await app.register(internalPaymentsRoutes, { prefix: '/internal/payments' });

  return app;
}

async function main() {
  await initOraclePool();
  const app = await buildApp();
  await app.listen({ port: env.PORT, host: env.HOST });
  logger.info({ port: env.PORT, host: env.HOST }, 'Сервер бэлэн');

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Сервер зогсож байна');
    await app.close();
    await closeOraclePool();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((e) => {
  logger.error({ err: e }, 'Server init алдаа');
  process.exit(1);
});
