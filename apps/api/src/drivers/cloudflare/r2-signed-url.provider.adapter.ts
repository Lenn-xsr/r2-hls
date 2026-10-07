/**
 * Node.js/TypeScript - Signed URL Generator
 *
 * Generates signed URLs for accessing private files in R2.
 */

import { createHmac } from 'crypto';
import { R2SignedUrlProviderPort } from 'src/application/ports/media.provider.port';

export interface SignedUrlOptions {
  /**
   * File key/path in R2 bucket
   * Example: "documents/contract.pdf" or "user-123/avatar.jpg"
   */
  key: string;

  /**
   * URL expiration time in seconds (default: 3600 = 1 hour)
   * Maximum: 86400 (24 hours)
   */
  expiresIn?: number;
}

export interface SignedUrlConfig {
  /**
   * Base URL of your Cloudflare Worker
   * Example: "https://cdn.yourapp.com" or "https://r2-worker.yourapp.workers.dev"
   */
  baseUrl: string;

  /**
   * Secret key for signing URLs (must match SIGNED_URL_SECRET in Cloudflare)
   */
  secret: string;
}

/**
 * Generates a signed URL for accessing private files in R2 bucket
 */
export class SignedUrlGenerator {
  private readonly baseUrl: string;
  private readonly secret: string;

  constructor(config: SignedUrlConfig) {
    if (!config.baseUrl) {
      throw new Error('SignedUrlGenerator: baseUrl is required');
    }
    if (!config.secret) {
      throw new Error('SignedUrlGenerator: secret is required');
    }

    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.secret = config.secret;
  }

  /**
   * Generate a signed URL for a private file
   */
  generate(options: SignedUrlOptions): string {
    const { key, expiresIn = 3600 } = options;

    if (!key) {
      throw new Error('SignedUrlGenerator: key is required');
    }

    const maxExpiration = 86400;
    const actualExpiration = Math.min(expiresIn, maxExpiration);

    // Remove leading slashes and "private/" prefix if present
    const sanitizedKey = key.replace(/^\/+/, '').replace(/^private\//, '');

    const expires = Math.floor(Date.now() / 1000) + actualExpiration;
    const dataToSign = `/private/${sanitizedKey}:${expires}`;

    const signature = createHmac('sha256', this.secret)
      .update(dataToSign)
      .digest('hex');

    // Encode each path segment individually, preserving slashes
    const encodedPath = sanitizedKey
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');

    const url = new URL(`${this.baseUrl}/private/${encodedPath}`);
    url.searchParams.set('expires', expires.toString());
    url.searchParams.set('signature', signature);

    return url.toString();
  }

  /**
   * Generate multiple signed URLs at once
   */
  generateBatch(
    keys: string[],
    expiresIn?: number,
  ): Array<{ key: string; url: string }> {
    return keys.map((key) => ({
      key,
      url: this.generate({ key, expiresIn }),
    }));
  }
}

/**
 * Factory function for quick usage
 */
export function generateSignedUrl(
  baseUrl: string,
  secret: string,
  options: SignedUrlOptions,
): string {
  const generator = new SignedUrlGenerator({ baseUrl, secret });
  return generator.generate(options);
}

/**
 * NestJS adapter that implements the R2SignedUrlProviderPort
 * Uses environment variables for configuration
 */
export class R2SignedUrlProviderAdapter implements R2SignedUrlProviderPort {
  private readonly generator: SignedUrlGenerator;

  constructor() {
    const baseUrl = process.env.R2_PUBLIC_URL;
    const secret = process.env.SIGNED_URL_SECRET;

    if (!baseUrl) {
      throw new Error(
        'R2SignedUrlProviderAdapter: R2_PUBLIC_URL env var is required',
      );
    }
    if (!secret) {
      throw new Error(
        'R2SignedUrlProviderAdapter: SIGNED_URL_SECRET env var is required',
      );
    }

    this.generator = new SignedUrlGenerator({ baseUrl, secret });
  }

  generateSignedUrl(key: string, expiresInSeconds = 3600): string {
    return this.generator.generate({ key, expiresIn: expiresInSeconds });
  }

  generateBatch(
    keys: string[],
    expiresInSeconds?: number,
  ): Array<{ key: string; url: string }> {
    return this.generator.generateBatch(keys, expiresInSeconds);
  }
}
