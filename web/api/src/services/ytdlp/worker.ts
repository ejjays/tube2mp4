import { parentPort, workerData } from 'node:worker_threads';
import { getVideoInfo } from './info.js';

async function runTask() {
  if (!parentPort) return;

  const { url, cookieArgs } = workerData;

  try {
    const info = await getVideoInfo(url, cookieArgs);
    parentPort.postMessage({ type: 'success', data: info });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    parentPort.postMessage({ type: 'error', message });
  }
}

// skipcq: JS-0098
void runTask();
