import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { ConnectMongoDB, DisconnectMongoDB } from '@r2-hls/database';
import { WorkerModule } from './worker.module';
import {
  DotenvEnvLoaderAdapter,
  EnvLoaderPort,
  GoogleEnvLoaderAdapter,
} from '@r2-hls/config';

const loadEnv = async () => {
  const envLoader: EnvLoaderPort = new DotenvEnvLoaderAdapter();
  await envLoader.loadEnv();

  if (process.env.APP_ENV === 'prod') {
    const googleEnvLoader = new GoogleEnvLoaderAdapter(
      process.env.APP_ENV,
      process.env.APP_NAME as string,
    );
    await googleEnvLoader.loadEnv();
  }
};

const bootstrap = async () => {
  const logger = new Logger('VideoWorker');

  await loadEnv();
  await ConnectMongoDB();

  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: ['log', 'warn', 'error', 'fatal'],
  });

  app.enableShutdownHooks();

  const shutdown = async (signal: string) => {
    logger.log(`Received ${signal}, shutting down worker...`);
    await app.close();
    await DisconnectMongoDB();
    logger.log('Worker shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  logger.log('Video transcoding worker started');
};

void bootstrap();
