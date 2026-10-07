export abstract class EnvLoaderPort {
  abstract loadEnv(): Promise<void>;
}
