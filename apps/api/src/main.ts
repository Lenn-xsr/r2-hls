import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConnectMongoDB, DisconnectMongoDB } from '@r2-hls/database';
import {
  INestApplication,
  Logger,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import {
  DotenvEnvLoaderAdapter,
  EnvLoaderPort,
  GoogleEnvLoaderAdapter,
} from '@r2-hls/config';
import { HttpExceptionFilter } from './interface/filters/exception.filter';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';

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

const setupSwagger = (app: INestApplication, logger: Logger, port: number) => {
  // Docs are disabled in production; available only in non-prod (localhost).
  if (process.env.APP_ENV === 'prod') return;

  const config = new DocumentBuilder()
    .setTitle('r2-hls API')
    .setDescription('Video ingestion API for the R2 + HLS pipeline')
    .setVersion('1.0')
    .addApiKey(
      {
        type: 'apiKey',
        name: 'Authorization',
        description: 'Shared ingest secret (VIDEO_INGEST_SECRET)',
        in: 'header',
      },
      'ingest-secret',
    )
    .addTag('Videos', 'Video ingestion endpoints')
    .addTag('Health', 'Health check')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  logger.log(`Swagger docs available at http://localhost:${port}/api/docs`);
};

const bootstrap = async () => {
  const logger = new Logger('Bootstrap');
  const port = process.env.PORT ?? 4000;

  await loadEnv();

  await ConnectMongoDB();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['log', 'warn', 'error', 'fatal'],
  });

  // Number of trusted proxy hops in front of the app (e.g. Cloudflare = 1,
  // Cloudflare + an ingress gateway = 2). The real client IP is read that many
  // entries from the right of X-Forwarded-For, ignoring spoofed left entries.
  app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 1));

  app.use(helmet());

  app.enableCors({
    origin: false,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new HttpExceptionFilter());

  setupSwagger(app, logger, Number(port));

  app.enableShutdownHooks();

  const shutdown = async (signal: string) => {
    logger.log(`Received ${signal}, starting graceful shutdown...`);
    await app.close();
    await DisconnectMongoDB();
    logger.log('Graceful shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  await app.listen(port);

  logger.log(`Server running on port ${port}`);
};

void bootstrap();
