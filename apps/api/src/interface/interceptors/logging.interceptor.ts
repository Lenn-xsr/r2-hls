import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';
import { LoggerProviderPort } from '@r2-hls/contracts';

interface RequestWithUser extends Request {
  user?: { id: string };
}

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: LoggerProviderPort) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const response = context.switchToHttp().getResponse<Response>();
    const { method, originalUrl, ip } = request;
    const userAgent = request.get('user-agent') || '';
    const requestId = request.headers['x-request-id'] as string;
    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - startTime;
          const statusCode = response.statusCode;

          this.logger.info(
            `${method} ${originalUrl} → ${statusCode} (${duration}ms)`,
            {
              event: 'http_request',
              requestId,
              method,
              path: originalUrl,
              statusCode,
              duration,
              ip,
              userAgent,
              userId: request.user?.id ?? null,
            },
          );
        },
        error: (error: unknown) => {
          const duration = Date.now() - startTime;
          const statusCode =
            error instanceof HttpException ? error.getStatus() : 500;
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';
          const logMethod = statusCode >= 500 ? 'error' : 'warn';

          this.logger[logMethod](
            `${method} ${originalUrl} → ${statusCode} (${duration}ms) — ${errorMessage}`,
            {
              event: 'http_request_error',
              requestId,
              method,
              path: originalUrl,
              statusCode,
              duration,
              ip,
              userAgent,
              userId: request.user?.id ?? null,
              error: errorMessage,
            },
          );
        },
      }),
    );
  }
}
