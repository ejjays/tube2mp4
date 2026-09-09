import {
  getVideoInfo as _getVideoInfo,
  spawnDownload as _spawnDownload,
  streamDownload as _streamDownload,
  downloadImage as _downloadImage,
  injectMetadata as _injectMetadata,
  downloadImageToBuffer as _downloadImageToBuffer,
  cacheVideoInfo as _cacheVideoInfo,
  acquireLock as _acquireLock,
  releaseLock as _releaseLock,
  COMMON_ARGS as _COMMON_ARGS,
  CACHE_DIR as _CACHE_DIR,
} from './ytdlp/index.js';

export const getVideoInfo = _getVideoInfo;
export const spawnDownload = _spawnDownload;
export const streamDownload = _streamDownload;
export const downloadImage = _downloadImage;
export const injectMetadata = _injectMetadata;
export const downloadImageToBuffer = _downloadImageToBuffer;
export const cacheVideoInfo = _cacheVideoInfo;
export const acquireLock = _acquireLock;
export const releaseLock = _releaseLock;
export const COMMON_ARGS = _COMMON_ARGS;
export const CACHE_DIR = _CACHE_DIR;
