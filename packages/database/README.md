# @r2-hls/database

Persistence shared by the API and the worker:

- `ConnectMongoDB` / `DisconnectMongoDB` — fail fast when `MONGO_URI` is missing
  or unreachable
- `MediaModel`, `MediaMapper` and `MongooseMediaRepositoryAdapter`, the Mongoose
  implementation of `MediaRepositoryPort` from `@r2-hls/contracts`
- `createQueueConnection()` — the Redis connection BullMQ needs
  (`REDIS_QUEUE_URL`, or `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` /
  `REDIS_QUEUE_DB`)

`mongoose`, `ioredis` and `@nestjs/common` are peer dependencies provided by the
consuming app.

```bash
pnpm --filter @r2-hls/database test
```