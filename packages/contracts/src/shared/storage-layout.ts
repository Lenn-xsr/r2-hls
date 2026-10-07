/**
 * R2 prefix where uploaded source files ("originals") live before transcoding:
 * `private/originals/{uuid}/source.{ext}`. The API only presigns uploads and
 * accepts registrations under this prefix.
 */
export const ORIGINALS_PREFIX = 'private/originals';

/**
 * Single source of truth for the R2 object prefix where a video's HLS delivery
 * artifacts (master/variant playlists, init segments, .m4s segments, poster)
 * live: `private/videos/{videoId}/v{version}`.
 *
 * The worker write-path uploads under this prefix; the API signs tokens scoped
 * to this prefix; the cdn-worker read-path maps `/v/{videoId}/{token}/v{version}/…`
 * back onto it. All of them MUST agree, so the Node services derive it from
 * here. The returned value has NO trailing slash; append `/` when building a
 * prefix match.
 */
export function hlsDeliveryPrefix(videoId: string, version: number): string {
  return `private/videos/${videoId}/v${version}`;
}
