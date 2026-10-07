import { Injectable } from '@nestjs/common';
import { createLogger, format, transports, Logger } from 'winston';
import { LoggerProviderPort, LogMetadata } from '@r2-hls/contracts';
import { DatadogTransport } from './datadog.transport';

const SKIP_KEYS = new Set(['level', 'message', 'timestamp', 'splat']);

const str = (v: unknown): string => (v == null ? '' : `${v as string}`);

const consoleFormat = format.printf((info) => {
  const ts = new Date().toISOString();
  const msg = info.message as string;

  const meta: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(info)) {
    if (
      !SKIP_KEYS.has(key) &&
      typeof key === 'string' &&
      !key.startsWith('Symbol')
    ) {
      meta[key] = value;
    }
  }

  const parts: string[] = [];

  if (meta.method && meta.path) {
    parts.push(`${str(meta.method)} ${str(meta.path)}`);
  }

  if (meta.statusCode !== undefined) {
    parts.push(str(meta.statusCode));
  }

  if (meta.duration !== undefined) {
    parts.push(`${str(meta.duration)}ms`);
  }

  if (meta.userId) {
    parts.push(`user=${str(meta.userId)}`);
  }

  if (meta.requestId) {
    parts.push(`req=${str(meta.requestId)}`);
  }

  if (meta.error) {
    parts.push(`error="${str(meta.error)}"`);
  }

  const detail = parts.length > 0 ? ` | ${parts.join(' | ')}` : '';
  return `[${info.level}] ${ts} ${msg}${detail}`;
});

@Injectable()
export class WinstonLoggerAdapter implements LoggerProviderPort {
  private logger: Logger;

  constructor() {
    this.logger = createLogger({
      level: 'debug',
      exitOnError: false,
      format: format.combine(format.timestamp(), format.json()),
      transports: [
        new transports.Console({
          format: format.combine(
            format.colorize({ level: true }),
            consoleFormat,
          ),
        }),
      ],
    });

    const ddKey = process.env.DATADOG_KEY;
    const appEnv = process.env.APP_ENV;

    if (appEnv === 'prod' && ddKey) {
      this.logger.add(
        new DatadogTransport({
          apiKey: ddKey,
          hostname: process.env.DATADOG_HOSTNAME ?? 'r2-hls',
          service: process.env.APP_NAME ?? 'r2-hls',
          ddsource: 'nodejs',
          intakeRegion: 'us5',
        }),
      );
      this.logger.info('Datadog transport enabled');
    } else {
      this.logger.warn(
        `Datadog transport disabled (APP_ENV=${appEnv ?? 'undefined'}, DATADOG_KEY=${ddKey ? 'set' : 'missing'})`,
      );
    }
  }

  debug(message: string, metadata?: LogMetadata): void {
    this.logger.debug(message, metadata as Record<string, unknown>);
  }

  info(message: string, metadata?: LogMetadata): void {
    this.logger.info(message, metadata as Record<string, unknown>);
  }

  warn(message: string, metadata?: LogMetadata): void {
    this.logger.warn(message, metadata as Record<string, unknown>);
  }

  error(message: string, metadata?: LogMetadata): void {
    this.logger.error(message, metadata as Record<string, unknown>);
  }
}
