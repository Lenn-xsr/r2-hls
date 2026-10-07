# r2-hls worker (HLS transcoder) — build from the repository root:
#   docker build -f apps/worker/Dockerfile -t r2-hls-worker .
FROM node:22-alpine AS builder
WORKDIR /repo

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json ./
COPY packages ./packages
COPY apps/worker ./apps/worker

RUN pnpm install --frozen-lockfile --filter @r2-hls/worker...

# Builds the workspace packages first, then the app.
RUN pnpm --filter @r2-hls/worker... build

RUN pnpm --filter @r2-hls/worker deploy --prod /app

FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

# ffmpeg/ffprobe are required by the transcoding pipeline.
RUN apk add --no-cache ffmpeg

COPY --from=builder --chown=node:node /app ./

# The worker has no HTTP server; it only consumes the queue.
USER node
CMD ["node", "dist/src/main.js"]