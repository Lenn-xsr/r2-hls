# @r2-hls/eslint-config

Shared ESLint flat config for the NestJS apps: `typescript-eslint` type-checked
rules plus Prettier.

```js
// eslint.config.mjs
import { nestjs } from '@r2-hls/eslint-config/nestjs';

export default nestjs(import.meta.dirname);
```