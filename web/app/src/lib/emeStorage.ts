/**
 * avoid wasting bandwidth on unreliable OPFS quotas.
 *
 * navigator.storage.estimate() over-reports on some android browsers.
 * we record where actual writes fail to bypass doomed downloads.
 */
const CEILING_KEY = 'phantom:emeOpfsCeiling';

// track failure point for routing
export function recordOpfsCeiling(bytes: number): void {
  if (typeof localStorage === 'undefined' || bytes <= 0) return;
  try {
    const prev = Number(localStorage.getItem(CEILING_KEY));
    const next =
      Number.isFinite(prev) && prev > 0 ? Math.min(prev, bytes) : bytes;
    localStorage.setItem(CEILING_KEY, String(next));
  } catch {
    // ignore write errors
  }
}

export function getOpfsCeiling(): number | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = Number(localStorage.getItem(CEILING_KEY));
    return Number.isFinite(raw) && raw > 0 ? raw : null;
  } catch {
    return null;
  }
}
