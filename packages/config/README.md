# @r2-hls/config

Environment loading behind one small port (`EnvLoaderPort`):

- `DotenvEnvLoaderAdapter` — loads `.env`, then `.env.local` on top of it
- `GoogleEnvLoaderAdapter(env, service)` — loads secrets from Google Secret
  Manager into `process.env`. Secrets are named `{env}--{service}--{VAR}`; only
  that prefix is read and it is stripped from the variable name. Requires
  `GOOGLE_CLOUD_PROJECT` and application default credentials.

Apps call the dotenv loader first and the Google loader only when
`APP_ENV=prod`, so secret values override anything from a file.

```bash
pnpm --filter @r2-hls/config test
```