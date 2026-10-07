import {
  HLS_VARIANTS,
  buildHlsFmp4Args,
  getVideoMetadata,
  selectVariants,
} from './hls-variants';

const names = (height: number) => selectVariants(height).map((v) => v.name);

/** Value that follows a flag in an ffmpeg argv. */
const valueOf = (args: string[], flag: string) => args[args.indexOf(flag) + 1];

describe('selectVariants', () => {
  it('offers the full ladder for a tall enough source', () => {
    expect(names(1920)).toEqual(['360p', '540p', '720p']);
    expect(names(1280)).toEqual(['360p', '540p', '720p']);
  });

  it('allows at most a 33% upscale (source >= 75% of the rung height)', () => {
    expect(names(960)).toEqual(['360p', '540p', '720p']);
    expect(names(959)).toEqual(['360p', '540p']);
    expect(names(720)).toEqual(['360p', '540p']);
    expect(names(719)).toEqual(['360p']);
  });

  it('always keeps the lowest rung, even for tiny sources', () => {
    expect(names(100)).toEqual(['360p']);
  });
});

describe('buildHlsFmp4Args', () => {
  const [low, mid] = HLS_VARIANTS;
  const base = { inputPath: '/in/source.mp4', outputDir: '/out' };

  it('splits the input once and scales each rung to an even width', () => {
    const args = buildHlsFmp4Args({
      ...base,
      variants: [low, mid],
      hasAudio: true,
    });

    expect(valueOf(args, '-filter_complex')).toBe(
      '[0:v]split=2[v360p][v540p];' +
        '[v360p]fps=30,scale=-2:640[v360pout];' +
        '[v540p]fps=30,scale=-2:960[v540pout]',
    );
  });

  it('pairs every video rung with the audio track and its own bitrates', () => {
    const args = buildHlsFmp4Args({
      ...base,
      variants: [low, mid],
      hasAudio: true,
    });

    expect(args.filter((arg) => arg === '0:a:0')).toHaveLength(2);
    expect(valueOf(args, '-b:v:0')).toBe('500k');
    expect(valueOf(args, '-b:v:1')).toBe('950k');
    expect(valueOf(args, '-b:a:1')).toBe('64k');
    expect(valueOf(args, '-var_stream_map')).toBe(
      'v:0,a:0,name:360p v:1,a:1,name:540p',
    );
  });

  it('emits no audio mapping at all for a silent source', () => {
    const args = buildHlsFmp4Args({
      ...base,
      variants: [low, mid],
      hasAudio: false,
    });

    expect(args).not.toContain('0:a:0');
    expect(args.some((arg) => arg.startsWith('-c:a'))).toBe(false);
    expect(valueOf(args, '-var_stream_map')).toBe(
      'v:0,name:360p v:1,name:540p',
    );
  });

  it('produces 2s GOP-aligned fMP4 VOD segments with a master playlist', () => {
    const args = buildHlsFmp4Args({ ...base, variants: [low], hasAudio: true });

    expect(valueOf(args, '-hls_time')).toBe('2');
    expect(valueOf(args, '-g')).toBe('60');
    expect(valueOf(args, '-sc_threshold')).toBe('0');
    expect(valueOf(args, '-hls_segment_type')).toBe('fmp4');
    expect(valueOf(args, '-hls_playlist_type')).toBe('vod');
    expect(valueOf(args, '-hls_flags')).toBe('independent_segments');
    expect(valueOf(args, '-master_pl_name')).toBe('master.m3u8');
    expect(valueOf(args, '-hls_segment_filename')).toBe(
      '/out/hls/%v/seg_%05d.m4s',
    );
    expect(args[args.length - 1]).toBe('/out/hls/%v/index.m3u8');
  });
});

describe('getVideoMetadata', () => {
  it('reads duration, dimensions and audio presence from ffprobe output', () => {
    const metadata = getVideoMetadata({
      format: { duration: '12.480000' },
      streams: [
        { codec_type: 'audio' },
        { codec_type: 'video', width: 1080, height: 1920 },
      ],
    });

    expect(metadata).toEqual({
      duration: 12.48,
      width: 1080,
      height: 1920,
      hasAudio: true,
    });
  });

  it('flags a video-only file as having no audio', () => {
    const metadata = getVideoMetadata({
      format: { duration: 3 },
      streams: [{ codec_type: 'video', width: 640, height: 360 }],
    });

    expect(metadata.hasAudio).toBe(false);
  });

  it('rejects input without a video stream', () => {
    expect(() =>
      getVideoMetadata({ streams: [{ codec_type: 'audio' }] }),
    ).toThrow('Input does not contain a video stream');
    expect(() => getVideoMetadata(undefined)).toThrow();
  });
});
