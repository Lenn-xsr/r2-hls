# @r2-hls/contracts

Framework-free code shared by the API and the worker, so the producer and the
consumer cannot drift apart:

- `Media` entity and its types (`VideoMeta`, `VideoStatus`, …)
- Ports as abstract classes, usable as NestJS injection tokens:
  `MediaRepositoryPort`, `VideoQueueProviderPort`, `R2ObjectStorageProviderPort`,
  `LoggerProviderPort`
- Queue identity: `VIDEO_PROCESSING_QUEUE`, `TRANSCODE_JOB_NAME`
- R2 key layout: `ORIGINALS_PREFIX` and `hlsDeliveryPrefix(videoId, version)`

It has no runtime dependencies and must not import NestJS, Mongoose or any SDK.