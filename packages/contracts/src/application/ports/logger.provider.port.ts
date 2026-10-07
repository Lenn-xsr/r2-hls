export interface LogMetadata {
  [key: string]: unknown;
}

export abstract class LoggerProviderPort {
  abstract debug(message: string, metadata?: LogMetadata): void;
  abstract info(message: string, metadata?: LogMetadata): void;
  abstract warn(message: string, metadata?: LogMetadata): void;
  abstract error(message: string, metadata?: LogMetadata): void;
}
