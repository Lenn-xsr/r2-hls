/**
 * Queue/job identity shared between the producer (api) and the consumer
 * (worker). These are pure contract strings — the BullMQ connection/prefix
 * infra that uses them lives in @r2-hls/database.
 */
export const VIDEO_PROCESSING_QUEUE = 'video-processing';
export const TRANSCODE_JOB_NAME = 'transcode-hls';
