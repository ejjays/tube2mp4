export function isHost(url: string, host: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname === host || hostname.endsWith(`.${host}`);
  } catch {
    return false;
  }
}

export function isHostname(hostname: string, host: string): boolean {
  const name = hostname.toLowerCase();
  return name === host || name.endsWith(`.${host}`);
}
