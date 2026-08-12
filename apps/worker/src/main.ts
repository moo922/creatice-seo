import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    bufferLogs: false,
  });
  const logger = new Logger('WorkerBootstrap');

  // Bind both the queue manager and health server. The health server is the
  // only HTTP surface of the worker; it stays out of the API's port space.
  const { HealthServer } = await import('./health/health-server');
  const health = app.get(HealthServer);
  health.start();

  const shutdown = (signal: string) => {
    logger.log(`Received ${signal}, shutting down`);
    void app.close().finally(() => process.exit(0));
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  logger.log('Worker started');
}

void bootstrap().catch((error) => {
  console.error('[worker] bootstrap failed:', error);
  process.exit(1);
});
