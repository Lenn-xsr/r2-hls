/**
 * Environment bindings and configuration for the Worker
 */
export interface Env {
  /**
   * R2 bucket binding for file storage
   */
  R2_BUCKET: R2Bucket;

  /**
   * Secret key for signing and validating URLs (HMAC-SHA256)
   * Must match the secret used by backends
   */
  SIGNED_URL_SECRET: string;

  /**
   * Dedicated secret for HLS prefix tokens (HMAC-SHA256).
   * Must match HLS_TOKEN_SECRET on the API. Separate from SIGNED_URL_SECRET.
   */
  HLS_TOKEN_SECRET: string;

  /**
   * Comma-separated list of allowed CORS origins
   * Example: "https://app.com,https://www.app.com"
   * Default: "*" (allow all origins)
   */
  ALLOWED_ORIGINS?: string;
}

/**
 * Result of URL signature validation
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
  key?: string;
}
