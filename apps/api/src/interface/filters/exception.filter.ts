import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiError } from 'src/domain/errors';

/**
 * Renders every error as RFC 7807 `application/problem+json`. Anything that is
 * not an HttpException is logged and reported as a generic 500, so internals
 * never leak to the client.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = request.headers['x-request-id'] as string;

    if (exception instanceof ApiError) {
      response
        .status(exception.getStatus())
        .setHeader('Content-Type', 'application/problem+json')
        .json({
          type: exception.type,
          title: exception.title,
          status: exception.getStatus(),
          detail: exception.detail,
          instance: request.url,
          requestId,
        });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      const message =
        typeof exceptionResponse === 'string'
          ? exceptionResponse
          : ((exceptionResponse as Record<string, unknown>).message ??
            exception.message);

      response
        .status(status)
        .setHeader('Content-Type', 'application/problem+json')
        .json({
          type: 'HTTP_ERROR',
          title: typeof message === 'string' ? message : 'Request error',
          status,
          detail: Array.isArray(message) ? message.join(', ') : null,
          instance: request.url,
          requestId,
        });
      return;
    }

    this.logger.error(
      `Unhandled error on ${request.method} ${request.url}`,
      exception instanceof Error ? exception.stack : String(exception),
    );

    response
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .setHeader('Content-Type', 'application/problem+json')
      .json({
        type: 'INTERNAL_ERROR',
        title: 'Internal server error',
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        detail: null,
        instance: request.url,
        requestId,
      });
  }
}
