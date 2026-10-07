# r2-hls API — build from the repository root:
#   docker build -f apps/api/Dockerfile -t r2-hls-api .
FROM node:22-alpine AS builder
WORKDIR /repo

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

# Root workspace manifests + the packages this app needs + the app itself.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json ./
COPY packages ./packages
COPY apps/api ./apps/api

# Install only the api and its workspace dependency graph.
RUN pnpm install --frozen-lockfile --filter @r2-hls/api...

# Builds the workspace packages first, then the app.
RUN pnpm --filter @r2-hls/api... build

# Self-contained, production-only copy: workspace packages are injected as
# real folders and dev dependencies are left out.
RUN pnpm --filter @r2-hls/api deploy --prod /app

FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder --chown=node:node /app ./

USER node
EXPOSE 4000
CMD ["node", "dist/src/main.js"]