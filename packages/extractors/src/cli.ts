#!/usr/bin/env node // skipcq: JS-0271
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { Readable, Writable } from 'node:stream';
import { getExtractor } from './index.js';
import { defaultEnv } from './shared/env.js';
import { VideoInfo, Format } from './shared/types.js';
import { ExtractorEnv } from './shared/env.js';

const usage = `usage:
  phantom-x info <url>                        print resolved metadata as json
  phantom-x <url> [-f <formatId>] [-o <file>] download (defaults: best format, stdout)
  phantom-x --help`;
const args = process.argv.slice(2);

function optValue(...names: string[]): string | undefined {
  for (const name of names) {
    const index = args.indexOf(name);
    if (index >= 0) return args[index + 1];
  }
  return undefined;
}

function ffmpegRemux(url: string, headers: Record<string, string>) {
  const headerFlags: string[] = [];
  for (const [name, value] of Object.entries(headers)) {
    headerFlags.push('-headers', `${name}: ${value}`);
  }
  const proc = spawn('ffmpeg', [
    '-hide_banner',
    '-loglevel', 'error',
    ...headerFlags,
    '-i', url,
    '-c', 'copy',
    '-movflags', 'frag_keyframe+empty_moov',
    '-f', 'mp4',
    'pipe:1',
  ]);
  let cancelled = false;
  return new ReadableStream({
    start(controller) {
      proc.stdout.on('data', (chunk: Buffer) => controller.enqueue(chunk));
      proc.stdout.on('end', () => controller.close());
      proc.on('error', (error: Error) => controller.error(error));
      proc.on('close', (code: number | null) => {
        if (cancelled) return;
        if (code) controller.error(new Error(`ffmpeg exited ${code}`));
      });
    },
    cancel() {
      cancelled = true;
      proc.kill('SIGKILL');
    },
  });
}

function envWithFfmpeg(): ExtractorEnv {
  return {
    ...defaultEnv,
    remuxHls: (url, headers) => Promise.resolve(ffmpegRemux(url, headers)),
  };
}

function bestFormat(info: VideoInfo): Format {
  return info.formats.reduce((prev, next) => {
    const a = (prev.width ?? 0) * (prev.height ?? 0);
    const b = (next.width ?? 0) * (next.height ?? 0);
    return b > a ? next : prev;
  });
}

async function pipeTo(stream: ReadableStream, out: Writable): Promise<void> {
  const reader = Readable.fromWeb(stream as never);
  await new Promise<void>((res, rej) => {
    reader.on('error', rej);
    out.on('error', rej);
    out.on('finish', res);
    reader.pipe(out);
  });
}

async function run() {
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(usage);
    return;
  }

  const isInfo = args[0] === 'info';
  const url = isInfo ? args[1] : args[0];
  const formatId = optValue('--format', '-f');
  const outPath = optValue('--output', '-o');
  if (!url) {
    console.log(usage);
    process.exitCode = 1;
    return;
  }

  const extractor = getExtractor(url, envWithFfmpeg());
  if (!extractor) {
    console.error(`no extractor for ${url} (x.com, vimeo.com, bsky.app)`);
    process.exitCode = 1;
    return;
  }

  const info = await extractor.getInfo(url);
  if (!info) {
    console.error(`no video found (or gated) for ${url}`);
    process.exitCode = 1;
    return;
  }

  if (isInfo) {
    console.log(JSON.stringify(info, null, 2));
    return;
  }

  const format =
    info.formats.find((fmt) => fmt.formatId === formatId) || bestFormat(info);
  const stream = await extractor.getStream(info, {
    formatId: format.formatId,
  });
  const out = outPath ? createWriteStream(outPath) : process.stdout;
  const quality = format.quality ?? format.formatId;
  process.stderr.write(
    `downloading ${quality}${outPath ? ` -> ${outPath}` : ''}\n`
  );
  await pipeTo(stream, out);
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});