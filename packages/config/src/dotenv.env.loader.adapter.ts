import * as dotenv from 'dotenv';
import { EnvLoaderPort } from './env.loader.port';

export class DotenvEnvLoaderAdapter implements EnvLoaderPort {
  async loadEnv() {
    // Load .env first (base config)
    dotenv.config({ path: '.env' });

    // Load .env.local with override (dev priority)
    dotenv.config({ path: '.env.local', override: true });

    await new Promise((resolve) => resolve(true));
    console.log('DotenvEnvLoaderAdapter loaded');
  }
}
