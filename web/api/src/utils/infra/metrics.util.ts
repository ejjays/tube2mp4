import type { Request, Response, NextFunction } from 'express';

// in-memory observability; resets on restart
interface RouteStat {
  count: number;
  errors: number;
  totalMs: number;
  maxMs: number;
}

export interface MetricsSnapshot {
  uptimeSec: number;
  totalRequests: number;
  totalErrors: number;
  routes: Record<
    string,
    { count: number; errors: number; avgMs: number; maxMs: number }
  >;
  failures: Record<string, number>;
  extractions: Record<
    string,
    { attempts: number; success: number; successRate: number; avgMs: number; maxMs: number }
  >;
}

// bound label cardinality against abuse
const MAX_LABELS = 200;
const startedAt = Date.now();
const routes = new Map<string, RouteStat>();
const failures = new Map<string, number>();

interface ExtractionStat {
  attempts: number;
  success: number;
  totalMs: number;
  maxMs: number;
}
const extractions = new Map<string, ExtractionStat>();

// fold overflow keys into "other"
function capKey(store: Map<string, unknown>, rawKey: string): string {
  if (store.has(rawKey) || store.size < MAX_LABELS) {
    return rawKey;
  }
  return 'other';
}

export function recordRequest(
  label: string,
  statusCode: number,
  durationMs: number
): void {
  const key = capKey(routes, label);
  const stat = routes.get(key) ?? {
    count: 0,
    errors: 0,
    totalMs: 0,
    maxMs: 0,
  };
  stat.count += 1;
  if (statusCode >= 500) {
    stat.errors += 1;
  }
  stat.totalMs += durationMs;
  if (durationMs > stat.maxMs) {
    stat.maxMs = durationMs;
  }
  routes.set(key, stat);
}

export function recordFailure(reason: string): void {
  const key = capKey(failures, reason);
  failures.set(key, (failures.get(key) ?? 0) + 1);
}

// track extraction outcomes (youtube:js:ANDROID_VR vs youtube:ytdlp) for /metrics
export function recordExtraction(
  label: string,
  success: boolean,
  durationMs: number
): void {
  const key = capKey(extractions, label);
  const stat = extractions.get(key) ?? {
    attempts: 0,
    success: 0,
    totalMs: 0,
    maxMs: 0,
  };
  stat.attempts += 1;
  if (success) {
    stat.success += 1;
  }
  stat.totalMs += durationMs;
  if (durationMs > stat.maxMs) {
    stat.maxMs = durationMs;
  }
  extractions.set(key, stat);
}

export function getMetrics(): MetricsSnapshot {
  const perRoute: MetricsSnapshot['routes'] = {};
  let totalRequests = 0;
  let totalErrors = 0;
  for (const [label, stat] of routes) {
    totalRequests += stat.count;
    totalErrors += stat.errors;
    perRoute[label] = {
      count: stat.count,
      errors: stat.errors,
      avgMs: Math.round(stat.totalMs / stat.count),
      maxMs: stat.maxMs,
    };
  }
  return {
    uptimeSec: Math.round((Date.now() - startedAt) / 1000),
    totalRequests,
    totalErrors,
    routes: perRoute,
    failures: Object.fromEntries(failures),
    extractions: Object.fromEntries(
      [...extractions].map(([label, stat]) => [
        label,
        {
          attempts: stat.attempts,
          success: stat.success,
          successRate: stat.attempts
            ? Math.round((stat.success / stat.attempts) * 100) / 100
            : 0,
          avgMs: Math.round(stat.totalMs / stat.attempts),
          maxMs: stat.maxMs,
        },
      ])
    ),
  };
}

export function resetMetrics(): void {
  routes.clear();
  failures.clear();
  extractions.clear();
}

// record latency + outcome per request
export function metricsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // skip long-lived SSE stream
  if (req.path === '/events') {
    next();
    return;
  }
  const start = Date.now();
  res.on('finish', () => {
    recordRequest(
      `${req.method} ${req.path}`,
      res.statusCode,
      Date.now() - start
    );
  });
  next();
}
