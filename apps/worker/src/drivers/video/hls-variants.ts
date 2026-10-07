export interface HlsVariant {
  name: string;
  height: number;
  videoBitrate: string;
  maxrate: string;
  bufsize: string;
  audioBitrate: string;
  bandwidth: number;
}

export const HLS_VARIANTS: HlsVariant[] = [
  {
    name: '360p',
    height: 640,
    videoBitrate: '500k',
    maxrate: '750k',
    bufsize: '1000k',
    audioBitrate: '64k',
    bandwidth: 650_000,
  },
  {
    name: '540p',
    height: 960,
    videoBitrate: '950k',
    maxrate: '1300k',
    bufsize: '1900k',
    audioBitrate: '64k',
    bandwidth: 1_100_000,
  },
  {
    name: '720p',
    height: 1280,
    videoBitrate: '1800k',
    maxrate: '2400k',
    bufsize: '3600k',
    audioBitrate: '96k',
    bandwidth: 2_000_000,
  },
];

export function selectVariants(sourceHeight: number): HlsVariant[] {
  const selected = HLS_VARIANTS.filter(
    (variant) => sourceHeight >= variant.height * 0.75,
  );

  if (selected.length > 0) {
    return selected;
  }

  return [HLS_VARIANTS[0]];
}

export interface BuildHlsArgsParams {
  inputPath: string;
  outputDir: string;
  variants: HlsVariant[];
  hasAudio: boolean;
}

/**
 * Builds the FFmpeg args for HLS fMP4/CMAF ABR output.
 * Segments use 2s GOP-aligned keyframes with independent_segments for clean ABR.
 */
export function buildHlsFmp4Args(params: BuildHlsArgsParams): string[] {
  const { inputPath, outputDir, variants, hasAudio } = params;

  const splitLabels = variants.map((v) => `[v${v.name}]`).join('');
  // `scale=-2:H` scales to the target height and auto-computes an EVEN width
  // (the `-2`), which libx264 requires. A plain aspect-preserving scale can land
  // on an odd width (e.g. a 496x864 source → 367x640) and fail the encoder with
  // "width not divisible by 2". `force_original_aspect_ratio=decrease` is dropped
  // on purpose: combined with `-2` it bypassed the even-rounding and reintroduced
  // the odd width. Heights in HLS_VARIANTS are all even.
  const outputFilters = variants
    .map((v) => `[v${v.name}]fps=30,scale=-2:${v.height}[v${v.name}out]`)
    .join(';');

  const filterComplex = `[0:v]split=${variants.length}${splitLabels};${outputFilters}`;

  const args: string[] = [
    '-y',
    '-i',
    inputPath,
    '-filter_complex',
    filterComplex,
  ];

  variants.forEach((variant) => {
    args.push('-map', `[v${variant.name}out]`);
    if (hasAudio) {
      args.push('-map', '0:a:0');
    }
  });

  variants.forEach((variant, index) => {
    args.push(`-c:v:${index}`, 'libx264');
    args.push(`-b:v:${index}`, variant.videoBitrate);
    args.push(`-maxrate:v:${index}`, variant.maxrate);
    args.push(`-bufsize:v:${index}`, variant.bufsize);
  });

  if (hasAudio) {
    variants.forEach((variant, index) => {
      args.push(`-c:a:${index}`, 'aac');
      args.push(`-b:a:${index}`, variant.audioBitrate);
      args.push(`-ac:a:${index}`, '2');
      args.push(`-ar:a:${index}`, '48000');
    });
  }

  // Cap encoder threads per job so many transcodes run in parallel without
  // oversubscribing all cores (WORKER_CONCURRENCY * FFMPEG_THREADS ~= cores).
  // Set FFMPEG_THREADS=0 for ffmpeg's auto threading.
  const ffmpegThreads = process.env.FFMPEG_THREADS ?? '4';

  args.push(
    '-threads',
    ffmpegThreads,
    '-preset',
    'veryfast',
    '-profile:v',
    'main',
    '-pix_fmt',
    'yuv420p',
    '-g',
    '60',
    '-keyint_min',
    '60',
    '-sc_threshold',
    '0',
    '-force_key_frames',
    'expr:gte(t,n_forced*2)',
    '-f',
    'hls',
    '-hls_time',
    '2',
    '-hls_playlist_type',
    'vod',
    '-hls_flags',
    'independent_segments',
    '-hls_segment_type',
    'fmp4',
    '-hls_fmp4_init_filename',
    'init_%v.mp4',
    '-hls_segment_filename',
    `${outputDir}/hls/%v/seg_%05d.m4s`,
    '-master_pl_name',
    'master.m3u8',
    '-var_stream_map',
    variants
      .map((variant, index) =>
        hasAudio
          ? `v:${index},a:${index},name:${variant.name}`
          : `v:${index},name:${variant.name}`,
      )
      .join(' '),
    `${outputDir}/hls/%v/index.m3u8`,
  );

  return args;
}

export interface ProbeVideoMetadata {
  duration: number;
  width: number;
  height: number;
  hasAudio: boolean;
}

interface FfprobeStream {
  codec_type?: string;
  width?: number;
  height?: number;
}

interface FfprobeResult {
  streams?: FfprobeStream[];
  format?: { duration?: string | number };
}

export function getVideoMetadata(input: unknown): ProbeVideoMetadata {
  const probe = (input ?? {}) as FfprobeResult;
  const streams = probe.streams ?? [];
  const videoStream = streams.find((s) => s.codec_type === 'video');
  const audioStream = streams.find((s) => s.codec_type === 'audio');

  if (!videoStream) {
    throw new Error('Input does not contain a video stream');
  }

  return {
    duration: Number(probe.format?.duration ?? 0),
    width: Number(videoStream.width ?? 0),
    height: Number(videoStream.height ?? 0),
    hasAudio: Boolean(audioStream),
  };
}
