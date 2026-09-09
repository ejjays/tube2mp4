import { Innertube } from 'youtubei.js';
import { logger } from '../../../utils/infra/logger.util.js';
import { BotGuardClient, getChallenge } from 'bgutils-js/botguard';
import { WebPoMinter } from 'bgutils-js/webpo';
import { buildURL, getHeaders } from 'bgutils-js/utils';
import type { WebPoSignalOutput } from 'bgutils-js/shared-types';
import { JSDOM } from 'jsdom';

/*
* poToken generation (bgutils-js v4). without it youtube serves SABR-only
* (no stream urls); with it ANDROID_VR returns real urls. token is bound to
* visitorData and lives few hours, so generate once & cache.
* v4 split the old BG all-in-one into challenge fetch -> botguard VM ->
* integrity token -> webpo minter, all composed here.
*/

// well-known youtube web botguard request key
const REQUEST_KEY = 'O43z0dpjhgX20SCx4KAo';
const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000;
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

export interface PoTokenBundle {
  poToken: string;
  visitorData: string;
  expiresAt: number;
}

let cached: PoTokenBundle | null = null;
let inflight: Promise<PoTokenBundle | null> | null = null;
let domReady = false;

// botguard's vm needs browser globals; v4 wants navigator/origin too
function ensureDom(): void {
  if (domReady) return;
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'https://www.youtube.com/',
    referrer: 'https://www.youtube.com/',
  });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    location: dom.window.location,
    origin: dom.window.origin,
  });
  if (!Reflect.has(globalThis, 'navigator')) {
    Object.defineProperty(globalThis, 'navigator', {
      value: dom.window.navigator,
    });
  }
  domReady = true;
}

async function fetchVisitorData(): Promise<string> {
  const bootstrap = await Innertube.create({ retrieve_player: false });
  const visitorData = bootstrap.session.context.client.visitorData;
  if (!visitorData) throw new Error('no visitorData from bootstrap session');
  return visitorData;
}

async function generate(): Promise<PoTokenBundle | null> {
  try {
    const visitorData = await fetchVisitorData();
    ensureDom();

    const challenge = await getChallenge({
      fetchFunction: globalThis.fetch,
      requestKey: REQUEST_KEY,
    });
    const script =
      challenge.interpreterJavascript
        ?.privateDoNotAccessOrElseSafeScriptWrappedValue;
    if (!script) throw new Error('challenge missing interpreter script');

    // eslint-disable-next-line sonarjs/code-eval -- trusted botguard payload
    new Function(script)();

    const botguard = await BotGuardClient.create({
      program: challenge.program,
      globalName: challenge.globalName,
      globalObject: globalThis as unknown as Record<string, unknown>,
    });

    const webPoSignalOutput = [] as unknown as WebPoSignalOutput;
    const botguardResponse = await botguard.snapshot({ webPoSignalOutput });

    const itResponse = await globalThis.fetch(
      buildURL('GenerateIT', false),
      {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify([REQUEST_KEY, botguardResponse]),
      }
    );
    if (!itResponse.ok) {
      throw new Error(`integrity token request failed: ${itResponse.status}`);
    }
    const [integrityToken, estimatedTtlSecs] = (await itResponse.json()) as [
      string,
      number,
      number,
      string
    ];

    const minter = await WebPoMinter.create(
      { integrityToken, estimatedTtlSecs },
      webPoSignalOutput
    );
    const poToken = await minter.mintAsWebsafeString(visitorData);

    const ttlMs = estimatedTtlSecs ? estimatedTtlSecs * 1000 : DEFAULT_TTL_MS;
    const bundle: PoTokenBundle = {
      poToken,
      visitorData,
      expiresAt: Date.now() + Math.max(ttlMs - REFRESH_MARGIN_MS, 60_000),
    };
    cached = bundle;
    logger.info(
      `[poToken] generated (len=${bundle.poToken.length}, ttl=${Math.round(
        (bundle.expiresAt - Date.now()) / 1000
      )}s)`
    );
    return bundle;
  } catch (err) {
    logger.warn('[poToken] generation failed:', (err as Error).message);
    return null;
  }
}

/*
* cached token; regenerates on expiry,
* one in-flight gen at a time, null on failure
*/

export function getPoToken(
  forceRefresh = false
): Promise<PoTokenBundle | null> {
  if (!forceRefresh && cached && Date.now() < cached.expiresAt) {
    return Promise.resolve(cached);
  }
  if (inflight) return inflight;
  inflight = generate().finally(() => {
    inflight = null;
  });
  return inflight;
}