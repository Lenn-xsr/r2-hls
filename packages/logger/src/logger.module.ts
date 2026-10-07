import { Global, Module } from '@nestjs/common';
import { LoggerProviderPort } from '@r2-hls/contracts';
import { WinstonLoggerAdapter } from './logger.provider.adapter';

@Global()
@Module({
  providers: [
    {
      provide: LoggerProviderPort,
      useClass: WinstonLoggerAdapter,
    },
  ],
  exports: [LoggerProviderPort],
})
export class LoggerModule {}
