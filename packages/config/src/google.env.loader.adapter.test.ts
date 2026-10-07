import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GoogleEnvLoaderAdapter } from './google.env.loader.adapter';

const secrets: Record<string, string> = {};
const accessed: string[] = [];
let listedParent: string | undefined;

vi.mock('@google-cloud/secret-manager', () => ({
  SecretManagerServiceClient: class {
    async *listSecretsAsync({ parent }: { parent: string }) {
      listedParent = parent;
      for (const name of Object.keys(secrets)) {
        yield { name: `${parent}/secrets/${name}` };
      }
    }

    accessSecretVersion({ name }: { name: string }) {
      accessed.push(name);
      const key = name.split('/secrets/')[1].replace('/versions/latest', '');
      return Promise.resolve([{ payload: { data: Buffer.from(secrets[key]) } }]);
    }
  },
}));

describe('GoogleEnvLoaderAdapter', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    process.env.GOOGLE_CLOUD_PROJECT = 'my-project';
    for (const key of Object.keys(secrets)) delete secrets[key];
    accessed.length = 0;
    listedParent = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...envBackup };
  });

  it('loads the secrets of its own env and service, without the prefix', async () => {
    secrets['prod--api--MONGO_URI'] = 'mongodb://db';
    secrets['prod--api--JWT_SECRET'] = 's3cret';

    await new GoogleEnvLoaderAdapter('prod', 'api').loadEnv();

    expect(listedParent).toBe('projects/my-project');
    expect(process.env.MONGO_URI).toBe('mongodb://db');
    expect(process.env.JWT_SECRET).toBe('s3cret');
  });

  it('never reads secrets that belong to another service or environment', async () => {
    secrets['prod--api--MONGO_URI'] = 'mine';
    secrets['prod--billing--STRIPE_KEY'] = 'not mine';
    secrets['staging--api--MONGO_URI'] = 'wrong environment';

    await new GoogleEnvLoaderAdapter('prod', 'api').loadEnv();

    expect(process.env.MONGO_URI).toBe('mine');
    expect(process.env.STRIPE_KEY).toBeUndefined();
    expect(accessed).toEqual([
      'projects/my-project/secrets/prod--api--MONGO_URI/versions/latest',
    ]);
  });

  it('overrides a value that was already set, e.g. by a .env file', async () => {
    process.env.MONGO_URI = 'from-dotenv';
    secrets['prod--api--MONGO_URI'] = 'from-secret-manager';

    await new GoogleEnvLoaderAdapter('prod', 'api').loadEnv();

    expect(process.env.MONGO_URI).toBe('from-secret-manager');
  });

  it('fails fast when the project is not configured', async () => {
    delete process.env.GOOGLE_CLOUD_PROJECT;

    await expect(
      new GoogleEnvLoaderAdapter('prod', 'api').loadEnv(),
    ).rejects.toThrow('GOOGLE_CLOUD_PROJECT env var is required');
  });
});