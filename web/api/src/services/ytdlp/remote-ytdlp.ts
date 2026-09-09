/**
 * delegate yt-dlp to residential phone service.
 *
 * datacenter IPs are often blocked; POSTing to a
 * residential IP via YTDLP_REMOTE_SECRET avoids this.
 */
import { secureFetch } from '../../utils/network/security.util.js';

const SECRET = process.env.YTDLP_REMOTE_SECRET?.trim() || '';
const ENV_URL = process.env.YTDLP_REMOTE_URL?.trim() || '';
// tunnel url churns; refresh fast
const URL_TTL_MS = 10_000;

let cached: { url: string; ts: number } = { url: '', ts: 0 };

// koyeb-local args the phone ignores
const STRIP_WITH_VALUE = new Set(['--cookies', '--cache-dir', '--proxy']);

export interface YtdlpResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

export function remoteYtdlpConfigured(): boolean {
  return SECRET.length > 0;
}

function stripLocalArgs(args: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (STRIP_WITH_VALUE.has(args[i])) {
      i++;
      continue;
    }
    out.push(args[i]);
  }
  return out;
}

export async function resolvePhoneTunnelUrl(): Promise<string> {
  if (cached.url && Date.now() - cached.ts < URL_TTL_MS) return cached.url;

  const base = process.env.TURSO_URL?.replace('libsql://', 'https://');
  const token = process.env.TURSO_AUTH_TOKEN;
  if (!base || !token) return '';

  try {
    const res = await secureFetch(`${base}/v2/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [
          {
            type: 'execute',
            stmt: {
              sql: "SELECT value FROM configs WHERE key = 'YTDLP_SERVICE_URL' LIMIT 1",
            },
          },
          { type: 'close' },
        ],
      }),
    });
    const data = (await res.json()) as {
      results?: Array<{
        response?: { result?: { rows?: Array<Array<{ value?: string }>> } };
      }>;
    };
    const value =
      data?.results?.[0]?.response?.result?.rows?.[0]?.[0]?.value ?? '';
    if (value) cached = { url: value, ts: Date.now() };
    return value;
  } catch {
    return '';
  }
}

async function resolveRemoteUrl(): Promise<string> {
  if (ENV_URL) return ENV_URL;
  return await resolvePhoneTunnelUrl();
}

export async function runYtdlpRemote(
  args: string[],
  signal: AbortSignal | null
): Promise<YtdlpResult | null> {
  const url = await resolveRemoteUrl();
  if (!url) return null;

  let stripped = url;
  while (stripped.endsWith('/')) stripped = stripped.slice(0, -1);
  const endpoint = `${stripped}/ytdlp`;
  const res = await secureFetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-ytdlp-secret': SECRET },
    body: JSON.stringify({ args: stripLocalArgs(args) }),
    signal: signal ?? undefined,
  });

  if (!res.ok) {
    cached = { url: '', ts: 0 };
    throw new Error(`remote yt-dlp HTTP ${res.status}`);
  }

  const data = (await res.json()) as Partial<YtdlpResult>;
  return {
    stdout: data.stdout ?? '',
    stderr: data.stderr ?? '',
    code: data.code ?? 0,
  };
}
