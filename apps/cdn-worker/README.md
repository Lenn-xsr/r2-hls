# @r2-hls/cdn-worker

Cloudflare Worker that is the only public read path to the R2 bucket. It has no
runtime dependencies and four routes:

| Route | Access | Caching |
| --- | --- | --- |
| `/v/{videoId}/{token}/v{version}/…` | HLS prefix token (one token for the whole version) | Edge cache under a token-less key, `immutable`; range requests bypass the cache |
| `/private/{key}?expires=…&signature=…` | Per-file signed URL | `no-store` |
| `/public/{key}` | None | `public, max-age=3600` |
| `/health` | None | |

Only `GET`, `HEAD` and `OPTIONS` are accepted. Keys are sanitized against path
traversal before they reach R2, and failed authentications are answered after a
short fixed delay.

## Token formats

Both are HMAC-SHA256 and must be produced by the API with the same secrets:

```
HLS token    {expires}.{hex( HMAC(HLS_TOKEN_SECRET,  "prefix:private/videos/{videoId}/v{version}/:{expires}") )}
Signed URL   signature = hex( HMAC(SIGNED_URL_SECRET, "/private/{key}:{expires}") )
```

A token is rejected when it has expired, when its expiry is more than 24 hours
away, or when it was signed for a different video or version.

## Layout

```
src/
  worker.ts        fetch handler: method check, CORS, routing
  handlers/        hls, private, public, cors, health
  services/        token and signed-URL validation, R2 file serving
  utils/           key sanitizing, constant-time comparison, responses
  config/          security headers and limits
```

## Develop and deploy

```bash
pnpm --filter @r2-hls/cdn-worker test        # Vitest, in-memory bucket and cache
pnpm --filter @r2-hls/cdn-worker typecheck

cd apps/cdn-worker
pnpm wrangler secret put HLS_TOKEN_SECRET
pnpm wrangler secret put SIGNED_URL_SECRET
pnpm run deploy                              # set bucket_name in wrangler.toml first
```

`ALLOWED_ORIGINS` (optional, comma-separated) restricts CORS; any origin is
allowed when it is unset.