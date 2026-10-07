// Domain
export * from './domain/value-objects/id';
export * from './domain/entities/media';

// Application ports (abstract-class DI tokens — framework-agnostic)
export * from './application/ports/media.repository.port';
export * from './application/ports/video-queue.provider.port';
export * from './application/ports/r2-object-storage.provider.port';
export * from './application/ports/logger.provider.port';

// Queue identity (names/jobs shared by producer + consumer)
export * from './queue/queue.constants';

// Shared R2 key layout (write-path and read-path derive keys from here)
export * from './shared/storage-layout';
