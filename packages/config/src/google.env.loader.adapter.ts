import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { EnvLoaderPort } from './env.loader.port';

/**
 * Loads secrets from Google Secret Manager into `process.env`.
 *
 * Secrets are named `{env}--{service}--{VAR}`; only the ones with this
 * service's prefix are read, and the prefix is stripped to form the variable
 * name. Values loaded here override anything set by a `.env` file.
 */
export class GoogleEnvLoaderAdapter implements EnvLoaderPort {
  private readonly env: string;
  private readonly service: string;

  constructor(env: string, service: string) {
    this.env = env;
    this.service = service;
  }

  async loadEnv() {
    const project = process.env.GOOGLE_CLOUD_PROJECT;

    if (!project) {
      throw new Error(
        'GoogleEnvLoaderAdapter: GOOGLE_CLOUD_PROJECT env var is required',
      );
    }

    const client = new SecretManagerServiceClient();
    const iterable = client.listSecretsAsync({
      parent: `projects/${project}`,
    });

    const prefix = `${this.env}--${this.service}--`;

    for await (const secret of iterable) {
      if (secret.name) {
        const envName = secret.name.split('/').at(-1)!;

        if (!envName.startsWith(prefix)) {
          continue;
        }

        const response = await client.accessSecretVersion({
          name: `${secret.name}/versions/latest`,
        });

        const envNameWithoutPrefix = envName.replace(prefix, '');

        process.env[envNameWithoutPrefix] =
          response[0].payload?.data?.toString() || '';
      }
    }

    console.log(`GoogleEnvLoaderAdapter loaded ${this.env} ${this.service}`);
  }
}