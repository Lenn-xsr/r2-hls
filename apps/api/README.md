# @r2-hls/api

NestJS HTTP API of the pipeline. It never touches video bytes: it hands out
presigned upload URLs, records videos in MongoDB, enqueues transcode jobs and
signs playback URLs for the [cdn-worker](../cdn-worker).

## Layout

```
src/
  domain/errors/            ApiError + the error catalogue (rendered as RFC 7807)
  application/
    usecases/video/         create-video-upload, register-video, get-video-playback
    ports/                  what the use cases need: upload URLs, HLS tokens, media resolution
    dtos/video/             request/response shapes (validated, documented in Swagger)
  drivers/
    cloudflare/             R2 presigner, HLS prefix-token signer, signed URLs, media resolver
    bullmq/                 transcode queue producer
    modules/                NestJS modules binding each port to its adapter
  interface/                controllers, shared-secret guard, error filter, logging, request id
  testing/                  in-memory fakes used by the specs
scripts/upload-video.ts     end-to-end demo client that only uses the HTTP API
```

## Endpoints

All under `/api/v1`, authenticated with `Authorization: <VIDEO_INGEST_SECRET>`.

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/videos/uploads` | Presigned `PUT` URL for a new original |
| `POST` | `/videos` | Register the upload and enqueue its transcode |
| `GET` | `/videos/:id` | Processing status |
| `GET` | `/videos/:id/playback` | Signed HLS + poster URLs (`409` until ready) |
| `POST` | `/videos/:id/transcode` | Re-transcode into a new version |
| `GET` | `/health` | Liveness |

Swagger UI: `http://localhost:4000/api/docs` (disabled when `APP_ENV=prod`).

## Run

From the repository root:

```bash
cp apps/api/.env.example apps/api/.env   # then fill it in
pnpm dev:api
pnpm --filter @r2-hls/api test
pnpm --filter @r2-hls/api upload:video ./sample.mp4 --title "Sample"
```

Environment variables are documented in [`.env.example`](.env.example) and in
the root README.

## Docker

```bash
docker build -f apps/api/Dockerfile -t r2-hls-api .   # from the repository root
```