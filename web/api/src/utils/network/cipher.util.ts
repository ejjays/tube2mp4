import tls from 'node:tls';

const ORIGINAL_CIPHERS = tls.DEFAULT_CIPHERS;
const TOP_N = 8;
const INTERVAL_MS = 1000 * 60 * 30; // 30 minutes

function shuffle(arr: string[]): string[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function randomizeCiphers(): void {
  const list = ORIGINAL_CIPHERS.split(':');
  const shuffled = shuffle(list.slice(0, TOP_N));
  tls.DEFAULT_CIPHERS = [...shuffled, ...list.slice(TOP_N)].join(':');
}

export function startCipherRotation(): void {
  randomizeCiphers();
  setInterval(randomizeCiphers, INTERVAL_MS).unref();
}
