# @r2-hls/logger

A Winston implementation of `LoggerProviderPort` (from `@r2-hls/contracts`) and a
global NestJS `LoggerModule` that provides it.

- Console output in every environment
- Optional Datadog log shipping when `APP_ENV=prod` and `DATADOG_KEY` are set
  (`DATADOG_HOSTNAME` and `APP_NAME` label the entries)

Import `LoggerModule` once in the root module and inject `LoggerProviderPort`
wherever structured logging is needed.