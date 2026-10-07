/**
 * Push a local video through the whole pipeline using only the public API —
 * the same four calls a real backend would make.
 *
 *   1. POST /videos/uploads        → presigned R2 upload URL
 *   2. PUT  {uploadUrl}            → bytes go straight to R2
 *   3. POST /videos                → register + enqueue transcode
 *   4. GET  /videos/:id            → poll until ready|failed
 *   5. GET  /videos/:id/playback   → signed master.m3u8 + poster
 *
 * Requires the API and the transcoding worker to be running.
 *
 * Usage:
 *   pnpm --filter @r2-hls/api upload:video <video> [--title "..."] [--api <url>]
 */

import { openAsBlob, existsSync, statSync } from 'fs';
import { basename, extname, resolve } from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

const CONTENT_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
};

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

interface Options {
  file: string;
  title?: string;
  apiBase: string;
}

interface VideoUpload {
  originalKey: string;
  uploadUrl: string;
  contentType: string;
}

interface VideoStatus {
  id: string;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  version: number;
  durationSeconds?: number;
  width?: number;
  height?: number;
  errorMessage?: string;
}

interface VideoPlayback {
  id: string;
  thumbnail: string;
  hls: string;
}

function fail(message: string): never {
  console.error(`\n  ERROR: ${message}\n`);
  process.exit(1);
}

function takeFlag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  const value = args[i + 1];
  if (!value || value.startsWith('--')) {
    fail(`${name} requires a value`);
  }
  args.splice(i, 2);
  return value;
}

function parseArgs(): Options {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(
      '\nUsage:\n  pnpm --filter @r2-hls/api upload:video <video> [--title "..."] [--api <url>]\n',
    );
    process.exit(args.length === 0 ? 1 : 0);
  }

  const title = takeFlag(args, '--title');
  const apiFlag = takeFlag(args, '--api');

  // The first remaining non-flag argument is the file path.
  const file = args.find((a) => !a.startsWith('--'));
  if (!file) {
    fail('Missing video file path');
  }

  const port = process.env.PORT ?? '4000';
  const apiBase = (apiFlag ?? `http://localhost:${port}`).replace(/\/$/, '');

  return { file, title, apiBase };
}

async function api<T>(
  opts: Options,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<T> {
  const secret = process.env.VIDEO_INGEST_SECRET;
  if (!secret) fail('Missing required env var: VIDEO_INGEST_SECRET');

  const res = await fetch(`${opts.apiBase}/api/v1${path}`, {
    method,
    headers: {
      Authorization: secret,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    fail(`${method} ${path} failed (${res.status}): ${await res.text()}`);
  }

  return (await res.json()) as T;
}

async function uploadOriginal(
  filePath: string,
  upload: VideoUpload,
): Promise<void> {
  const res = await fetch(upload.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': upload.contentType },
    body: await openAsBlob(filePath),
  });

  if (!res.ok) {
    fail(`Upload to R2 failed (${res.status}): ${await res.text()}`);
  }
}

async function waitUntilReady(
  opts: Options,
  videoId: string,
): Promise<VideoStatus> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let lastStatus = '';

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    const status = await api<VideoStatus>(opts, 'GET', `/videos/${videoId}`);

    if (status.status !== lastStatus) {
      console.log(`  status: ${status.status}`);
      lastStatus = status.status;
    }

    if (status.status === 'ready') return status;
    if (status.status === 'failed') {
      fail(`Transcode failed: ${status.errorMessage ?? 'unknown error'}`);
    }
  }

  fail('Timed out waiting for the transcode to finish (10 min).');
}

async function run(): Promise<void> {
  const opts = parseArgs();

  const filePath = resolve(opts.file);
  if (!existsSync(filePath)) {
    fail(`Video file not found: ${filePath}`);
  }

  const extension = extname(filePath).toLowerCase();
  const contentType = CONTENT_TYPES[extension];
  if (!contentType) {
    fail(
      `Unsupported file extension "${extension}". Allowed: ${Object.keys(CONTENT_TYPES).join(', ')}`,
    );
  }

  const sizeMb = (statSync(filePath).size / (1024 * 1024)).toFixed(2);
  console.log(`\n  API: ${opts.apiBase}`);
  console.log(`  File: ${basename(filePath)} (${sizeMb} MB)\n`);

  console.log('Step 1/4 — Requesting a presigned upload URL');
  const upload = await api<VideoUpload>(opts, 'POST', '/videos/uploads', {
    contentType,
  });
  console.log(`  key: ${upload.originalKey}`);

  console.log('\nStep 2/4 — Uploading the original straight to R2');
  await uploadOriginal(filePath, upload);

  console.log('\nStep 3/4 — Registering the video + enqueueing the transcode');
  const registered = await api<VideoStatus>(opts, 'POST', '/videos', {
    originalKey: upload.originalKey,
    ...(opts.title ? { title: opts.title } : {}),
  });
  console.log(`  id: ${registered.id} (v${registered.version})`);

  console.log('\nStep 4/4 — Waiting for the transcode');
  const ready = await waitUntilReady(opts, registered.id);

  const playback = await api<VideoPlayback>(
    opts,
    'GET',
    `/videos/${ready.id}/playback`,
  );

  console.log(
    `\n  Ready: ${ready.width}x${ready.height}, ${ready.durationSeconds}s, v${ready.version}`,
  );
  console.log(`\n  Poster:  ${playback.thumbnail}`);
  console.log(`  HLS:     ${playback.hls}`);
  console.log(
    '\n  Paste the HLS URL into examples/hls-player.html to watch it.\n',
  );
}

run().catch((err) => {
  console.error('\nScript failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
