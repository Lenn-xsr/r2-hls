# @r2-hls/worker

Standalone **HLS transcoding worker**. It is a NestJS **application context**
(no HTTP server): it connects to Mongo, boots a BullMQ worker on the
`video-processing` queue, transcodes uploaded originals into fMP4/CMAF HLS with
ffmpeg, uploads the artifacts to Cloudflare R2, and flips the Media document to
`ready`.

Shared contracts come from workspace packages so the producer (`@r2-hls/api`)
and this consumer cannot drift:

- [`@r2-hls/contracts`](../../packages/contracts) — Media domain/enums, ports,
  queue identity (`VIDEO_PROCESSING_QUEUE` / `TRANSCODE_JOB_NAME`), HLS prefix.
- [`@r2-hls/database`](../../packages/database) — Mongoose Media model/mapper/
  repository adapter, Mongo connection, BullMQ Redis connection.
- [`@r2-hls/logger`](../../packages/logger) — Winston logger + `LoggerModule`.
- [`@r2-hls/config`](../../packages/config) — env loading (.env + Secret Manager).

## Architecture

- `src/main.ts` — loads env (dotenv → Google Secret Manager in prod), connects
  Mongo, creates the Nest application context, wires shutdown hooks.
- `src/drivers/video/*` — ffmpeg pipeline (`video-hls.service`, `hls-variants`)
  and the BullMQ `VideoProcessingProcessor`.
- `src/drivers/cloudflare/r2-object-storage.provider.adapter.ts` — R2 download/upload.
- `src/drivers/modules/*` — slim `MediaPersistenceModule` (Media repo only) and
  `VideoProcessingModule` (Bull root + queue + transcode wiring).

## Requirements

- Node 22 (see `engines`)
- ffmpeg / ffprobe on PATH (the Docker image installs `ffmpeg` via apk)

## Env

See `.env.example`.

## Local development

Run from the **repo root** (pnpm workspace):

```bash
pnpm install                             # links @r2-hls/* workspace packages
pnpm --filter @r2-hls/worker... build    # build contracts/database/logger/config then the worker
pnpm dev:worker                          # watch mode (turbo run dev --filter=@r2-hls/worker)
```

## Build

```bash
pnpm --filter @r2-hls/worker... build    # -> apps/worker/dist/src/main.js
```

## Test

```bash
pnpm --filter @r2-hls/worker test
```

The suite includes an integration test that transcodes a generated clip with
the real ffmpeg; it is skipped when ffmpeg is not installed.

## Docker

```bash
docker build -f apps/worker/Dockerfile -t r2-hls-worker .   # from the repository root
```

The image installs ffmpeg and runs as a non-root user. It exposes no port.
