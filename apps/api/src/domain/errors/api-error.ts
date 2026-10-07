import { HttpException } from '@nestjs/common';
import { ErrorType, ErrorTypes } from './error-types';

export class ApiError extends HttpException {
  public readonly type: string;
  public readonly title: string;
  public readonly detail: string | null;

  constructor(errorType: ErrorType, detail?: string) {
    super(
      { type: errorType.type, title: errorType.title, detail: detail ?? null },
      errorType.status,
    );
    this.type = errorType.type;
    this.title = errorType.title;
    this.detail = detail ?? null;
  }

  static internal(detail?: string): ApiError {
    return new ApiError(ErrorTypes.INTERNAL_ERROR, detail);
  }
}
