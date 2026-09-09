import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { secureFetch } from '../../utils/network/security.util.js';

const fsPromises = fs.promises;

export async function downloadImage(
  url: string,
  dest: string
): Promise<string> {
  try {
    const response = await secureFetch(url);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const arrayBuffer = await response.arrayBuffer();
    await fsPromises.writeFile(dest, Buffer.from(arrayBuffer));
    return dest;
  } catch (err) {
    if (fs.existsSync(dest))
      await fsPromises.unlink(dest).catch(() => {
        /* ignore */
      });
    throw err;
  }
}

export async function downloadImageToBuffer(url: string): Promise<Buffer> {
  const response = await secureFetch(url);
  if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export interface Metadata {
  coverFile?: string;
  title?: string;
  artist?: string;
  album?: string;
  year?: string;
}

// ffmpeg metadata args for audio tagging
export function audioMetadataArgs(meta: {
  title?: string;
  uploader?: string;
  album?: string;
  year?: string;
}): string[] {
  const args: string[] = [];
  if (meta.title) args.push('-metadata', `title=${meta.title}`);
  if (meta.uploader) args.push('-metadata', `artist=${meta.uploader}`);
  if (meta.album) args.push('-metadata', `album=${meta.album}`);
  if (meta.year && meta.year !== 'Unknown')
    args.push('-metadata', `date=${meta.year}`);
  return args;
}

export function injectMetadata(
  filePath: string,
  metadata: Metadata
): Promise<boolean> {
  return new Promise((resolve) => {
    const ext = path.extname(filePath),
      tempOut = filePath.replace(ext, `_tagged${ext}`),
      ffmpegArgs = ['-y', '-i', filePath];
    if (metadata.coverFile && fs.existsSync(metadata.coverFile))
      ffmpegArgs.push('-i', metadata.coverFile);
    ffmpegArgs.push('-map', '0:v?', '-map', '0:a');
    if (metadata.coverFile && fs.existsSync(metadata.coverFile))
      ffmpegArgs.push('-map', '1:0', '-disposition:v:1', 'attached_pic');

    const metaObj = metadata as Record<string, unknown>;
    ['title', 'artist', 'album'].forEach((key) => {
      if (metaObj[key]) ffmpegArgs.push('-metadata', `${key}=${metaObj[key]}`);
    });
    if (metadata.year && metadata.year !== 'Unknown')
      ffmpegArgs.push('-metadata', `date=${metadata.year}`);
    ffmpegArgs.push('-c', 'copy', tempOut);
    const ff = spawn('ffmpeg', ffmpegArgs, { detached: true });
    ff.on('close', (code) => {
      if (code === 0 && fs.existsSync(tempOut)) {
        fs.renameSync(tempOut, filePath);
        resolve(true);
        return;
      }
      if (fs.existsSync(tempOut)) fs.unlinkSync(tempOut);
      resolve(false);
    });
  });
}
