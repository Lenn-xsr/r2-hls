export abstract class HlsTokenProviderPort {
  /**
   * Generates a short-lived token that authorizes access to every object under
   * the prefix `private/videos/{videoId}/v{version}/`.
   * Returned format: `{expires}.{hmacHex}`.
   */
  abstract generate(
    videoId: string,
    version: number,
    ttlSeconds?: number,
  ): string;
}
