import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import * as controllers from '../../interface/controllers';
import { LoggerModule } from '@r2-hls/logger';
import { VideoModule } from './video.module';
import { RequestIdMiddleware } from '../../interface/middleware/request-id.middleware';

@Module({
  imports: [LoggerModule, VideoModule],
  controllers: Object.values(controllers),
})
export class BaseModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*path');
  }
}
