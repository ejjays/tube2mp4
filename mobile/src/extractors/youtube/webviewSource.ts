/*
 * youtube "confirm 'not a bot" wall — read before going down this hole.
 * the trap: web/api works while the app walls at the same time, same IP, so
 * it looks mobile-only. it isnt — i diffed the app's exact request vs the
 * backend's & they're identical: same youtubei.js, ANDROID_VR client, 796 poToken,
 * same headers, same IP. the app just tripped it more (4 clients + retries, plus
 * debug runs hammering the IP). its just youtube's flaky per-IP bot throttle — works,
 * walls for a while, works again. dont re-check token/headers/transport (tried
 * okhttp + chromium, both walled), already been there. only a logged-in cookie
 * truly dodges it and we skip that on purpose to stay cookieless + backend-free.
 *
 * so: ANDROID_VR + IOS only (others are sabr, no urls), and bail on first
 * LOGIN_REQUIRED instead of hammering the IP. flip DEBUG here or YT_DEBUG in
 * bridge.ts to dump requests.
 */
/* runs inside webview; youtube.com origin dodges cors */
const RAW_HTML = `<!doctype html>
<html>
<head><meta charset="utf-8" /></head>
<body>
<script>
  window.__post = function (m) {
    try { window.ReactNativeWebView.postMessage(JSON.stringify(m)); } catch (e) {}
  };
  window.addEventListener('error', function (e) {
    window.__post({
      log: true,
      stage: 'error',
      detail: (e.message || '') + ' @ ' + (e.filename || '') + ':' + (e.lineno || 0),
    });
  });
  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason;
    window.__post({ log: true, stage: 'reject', detail: String((r && r.message) || r) });
  });
</script>
<script>
  const post = window.__post;
  const DEBUG = false;
  const SABR_TEST = false;
  const log = (stage, detail) => {
    if (DEBUG) post({ log: true, stage, detail: String(detail) });
  };
  const warn = (stage, detail) => post({ log: true, stage, detail: String(detail) });
  warn('wv', 'script start');
  const REQUEST_KEY = 'O43z0dpjhgX20SCx4KAo';
  // visionos-minted urls (c=VISIONOS) serve on this ip's cdn edge while
  // android-vr (c=ANDROID_VR) 403 — measured same-instant same-node.
  // keep android-vr + ios as fallback for clients that reject visionos
  const CLIENTS = ['VISIONOS', 'ANDROID_VR', 'IOS'];
  const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000;
  const REFRESH_MARGIN_MS = 5 * 60 * 1000;
  const rnFetches = {};
  window.__rnFetchResponse = (reqId, payload) => {
    const waiter = rnFetches[reqId];
    if (!waiter) return;
    delete rnFetches[reqId];
    if (!payload || !payload.ok) {
      waiter.reject(new Error((payload && payload.error) || 'rn fetch failed'));
      return;
    }
    waiter.resolve(
      new Response(payload.body, {
        status: payload.status || 200,
        headers: payload.headers || {},
      })
    );
  };
  const httpFetch = async (input, init) => {
    const raw = typeof input === 'string' ? input : (input && input.url) || '';
    if (raw.indexOf('/youtubei/') === -1) return fetch(input, init);
    const request = new Request(input, init);
    const headers = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });
    let body;
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      body = await request.text();
    }
    const reqId = Date.now() + '_' + Math.random().toString(36).slice(2);
    return new Promise((resolve, reject) => {
      rnFetches[reqId] = { resolve, reject };
      post({
        rnFetch: true,
        reqId,
        url: request.url,
        method: request.method,
        headers,
        body,
      });
    });
  };
  let Innertube;
  let BG;
  let armed = null;
  let arming = null;
  let searchClient = null;
  let searchClientP = null;
  function importWithTimeout(url, ms) {
    return Promise.race([
      import(url),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), ms)
      ),
    ]);
  }
  async function importFirst(urls, label) {
    let lastErr;
    for (const url of urls) {
      try {
        return await importWithTimeout(url, 25000);
      } catch (e) {
        lastErr = e;
        warn('import', label + ' miss: ' + (e && e.message));
      }
    }
    throw lastErr || new Error(label + ' failed');
  }
  async function boot() {
    warn('import', 'youtubei start');
    const ytMod = await importFirst(
      [
        // v18 added the VISIONOS client; v17 errors "Invalid client: VISIONOS"
        'https://cdn.jsdelivr.net/npm/youtubei.js@18/bundle/browser.js',
        'https://unpkg.com/youtubei.js@18/bundle/browser.js',
        'https://esm.sh/youtubei.js@18?bundle',
      ],
      'youtubei'
    );
    Innertube = ytMod.Innertube;
    warn('import', 'youtubei ok');
  }
  async function ensureBG() {
    if (BG) return BG;
    try {
      const [botguard, webpo, utils] = await Promise.all([
        importFirst(
          [
            'https://esm.sh/bgutils-js@4.0.3/botguard?bundle',
            'https://cdn.jsdelivr.net/npm/bgutils-js@4.0.3/dist/exports/botguard.js/+esm',
          ],
          'bg-botguard'
        ),
        importFirst(
          [
            'https://esm.sh/bgutils-js@4.0.3/webpo?bundle',
            'https://cdn.jsdelivr.net/npm/bgutils-js@4.0.3/dist/exports/webpo.js/+esm',
          ],
          'bg-webpo'
        ),
        importFirst(
          [
            'https://esm.sh/bgutils-js@4.0.3/utils?bundle',
            'https://cdn.jsdelivr.net/npm/bgutils-js@4.0.3/dist/exports/utils.js/+esm',
          ],
          'bg-utils'
        ),
      ]);
      BG = { ...botguard, ...webpo, ...utils };
      warn('import', 'bgutils ok');
    } catch (e) {
      warn('import', 'bgutils fail: ' + (e && e.message));
    }
    return BG;
  }
  async function makePoToken(visitorData) {
    const challenge = await BG.getChallenge({
      fetchFunction: fetch,
      requestKey: REQUEST_KEY,
    });
    if (!challenge) throw new Error('challenge empty');
    const script =
      challenge.interpreterJavascript &&
      challenge.interpreterJavascript.privateDoNotAccessOrElseSafeScriptWrappedValue;
    if (script) new Function(script)();
    const botguard = await BG.BotGuardClient.create({
      program: challenge.program,
      globalName: challenge.globalName,
      globalObject: window,
    });
    const webPoSignalOutput = [];
    const botguardResponse = await botguard.snapshot({ webPoSignalOutput });
    const itResponse = await fetch(BG.buildURL('GenerateIT', false), {
      method: 'POST',
      headers: BG.getHeaders(),
      body: JSON.stringify([REQUEST_KEY, botguardResponse]),
    });
    const itJson = await itResponse.json();
    const [integrityToken, estimatedTtlSecs] = itJson;
    const minter = await BG.WebPoMinter.create(
      { integrityToken, estimatedTtlSecs },
      webPoSignalOutput
    );
    const poToken = await minter.mintAsWebsafeString(visitorData);
    return { poToken, ttlMs: estimatedTtlSecs ? estimatedTtlSecs * 1000 : 0 };
  }
  function extractUrl(value) {
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object') {
      if (typeof value.href === 'string' && value.href.indexOf('http') === 0)
        return value.href;
      if (typeof value.url === 'string' && value.url.indexOf('http') === 0)
        return value.url;
      const s = String(value);
      if (s.indexOf('http') === 0) return s;
    }
    return undefined;
  }
  async function mapFormat(f, player) {
    let url = typeof f.url === 'string' ? f.url : undefined;
    let deciphered;
    try {
      if (player) deciphered = await f.decipher(player);
    } catch (e) {
      deciphered = undefined;
    }
    const fast = extractUrl(deciphered);
    if (typeof fast === 'string') url = fast;
    return {
      itag: f.itag,
      url,
      mimeType: f.mime_type,
      width: f.width,
      height: f.height,
      bitrate: f.bitrate,
      qualityLabel: f.quality_label,
      hasAudio: f.has_audio,
      hasVideo: f.has_video,
      contentLength: f.content_length,
      audioQuality: f.audio_quality,
      language: f.language,
      isOriginal: f.is_original,
    };
  }
  async function armClient() {
    log('arm', 'boot innertube');
    const boot0 = await Innertube.create({
      retrieve_player: false,
      fetch: httpFetch,
    });
    const visitorData = boot0.session.context.client.visitorData;
    log('arm', 'visitorData ' + (visitorData ? 'ok' : 'missing'));
    let poToken;
    let ttlMs = 0;
    const bg = await ensureBG();
    if (bg) {
      try {
        const tok = await makePoToken(visitorData);
        poToken = tok.poToken;
        ttlMs = tok.ttlMs;
        log('arm', 'potoken len=' + (poToken ? poToken.length : 0));
      } catch (e) {
        warn('potoken', e && e.message);
      }
    }
    const yt = await Innertube.create({
      po_token: poToken,
      visitor_data: visitorData,
      generate_session_locally: true,
      fetch: httpFetch,
    });
    const player = yt.session.player;
    log('arm', 'player ' + (player ? 'ok' : 'missing'));
    const lifeMs = ttlMs > 0 ? ttlMs : DEFAULT_TTL_MS;
    return {
      yt,
      player,
      poToken,
      visitorData,
      expiresAt: Date.now() + Math.max(lifeMs - REFRESH_MARGIN_MS, 60000),
    };
  }
  function getArmedClient() {
    if (armed && Date.now() < armed.expiresAt) return Promise.resolve(armed);
    if (arming) return arming;
    arming = armClient()
      .then((bundle) => {
        armed = bundle;
        return bundle;
      })
      .finally(() => {
        arming = null;
      });
    return arming;
  }
  function getSearchClient() {
    if (searchClient) return Promise.resolve(searchClient);
    if (searchClientP) return searchClientP;
    searchClientP = Innertube.create({
      retrieve_player: false,
      fetch: httpFetch,
    })
      .then((client) => {
        searchClient = client;
        return client;
      })
      .finally(() => {
        searchClientP = null;
      });
    return searchClientP;
  }
  async function resolveSabrConfig(yt, videoId) {
    const info = await yt.getBasicInfo(videoId, 'WEB');
    if ((info.playability_status || {}).status !== 'OK') return null;
    const sd = info.streaming_data || {};
    if (!sd.server_abr_streaming_url) return null;
    const um = JSON.stringify(info).match(
      /"video_playback_ustreamer_config":"([^"]+)"/
    );
    const b = info.basic_info || {};
    const durationMs = (b.duration || 0) * 1000;
    const formats = (sd.adaptive_formats || []).map((f) => ({
      itag: f.itag,
      lastModified: String(f.last_modified_ms || ''),
      xtags: f.xtags,
      width: f.width,
      height: f.height,
      contentLength: f.content_length ? Number(f.content_length) : undefined,
      mimeType: f.mime_type,
      bitrate: f.bitrate || 0,
      averageBitrate: f.average_bitrate,
      approxDurationMs: Number(f.approx_duration_ms || durationMs),
      audioQuality: f.audio_quality,
      qualityLabel: f.quality_label,
      quality: f.quality,
      hasAudio: f.has_audio,
      hasVideo: f.has_video,
    }));
    return {
      serverAbrStreamingUrl: sd.server_abr_streaming_url,
      ustreamerConfig: um ? um[1] : '',
      durationMs: durationMs,
      formats: formats,
      meta: {
        id: videoId,
        title: b.title,
        author: b.author,
        duration: b.duration,
        thumbnail:
          (b.thumbnail && b.thumbnail[0] && b.thumbnail[0].url) || undefined,
      },
    };
  }
  async function extractWith(videoId, reqId, bundle, meta) {
    const yt = bundle.yt;
    const player = bundle.player;
    let lastError = 'no clients';
    let loginRequired = false;
    let playabilityReason = '';
    for (const client of CLIENTS) {
      try {
        log('getInfo', client + ' start');
        const info = await yt.getInfo(videoId, { client });
        if (!meta.posted) {
          const bi = info.basic_info || {};
          if (bi.title) {
            post({
              reqId,
              partial: true,
              meta: {
                id: videoId,
                title: bi.title,
                author: bi.author,
                duration: bi.duration,
                thumbnail: (bi.thumbnail && bi.thumbnail[0] && bi.thumbnail[0].url) || undefined,
              },
            });
            meta.posted = true;
          }
        }
        const sd = info.streaming_data || {};
        const ps = info.playability_status || {};
        const formats = await Promise.all(
          (sd.formats || []).map((f) => mapFormat(f, player))
        );
        const adaptive = await Promise.all(
          (sd.adaptive_formats || []).map((f) => mapFormat(f, player))
        );
        const usable = [...formats, ...adaptive].filter((x) => x.url);
        log(
          'getInfo',
          client + ' f=' + formats.length + ' a=' + adaptive.length + ' usable=' + usable.length + ' play=' + (ps.status || '?')
        );
        if (usable.length > 0) {
          const b = info.basic_info || {};
          return {
            id: videoId,
            title: b.title,
            author: b.author,
            duration: b.duration,
            thumbnail: (b.thumbnail && b.thumbnail[0] && b.thumbnail[0].url) || undefined,
            client,
            poToken: Boolean(bundle.poToken),
            formats,
            adaptive,
          };
        }
        if (ps.status === 'LOGIN_REQUIRED') {
          loginRequired = true;
          lastError = ps.reason || 'Sign in to confirm you are not a bot';
          break;
        } else {
          if (
            ps.status &&
            ps.status !== 'OK' &&
            ps.reason &&
            !playabilityReason
          ) {
            playabilityReason = ps.reason;
          }
          lastError = client + ': no usable urls (sabr?)';
        }
      } catch (e) {
        lastError = client + ': ' + (e && e.message);
        warn('getInfo', lastError);
      }
    }
    try {
      const sabr = await resolveSabrConfig(yt, videoId);
      if (sabr && sabr.serverAbrStreamingUrl) {
        warn(
          'sabr',
          'config ok ustreamer=' +
            sabr.ustreamerConfig.length +
            ' formats=' +
            sabr.formats.length
        );
      } else {
        warn('sabr', 'no config');
      }
    } catch (e) {
      warn('sabr', 'probe fail ' + (e && e.message));
    }
    if (!playabilityReason && !loginRequired) {
      try {
        const web = await yt.getBasicInfo(videoId, 'WEB');
        const wps = web.playability_status || {};
        if (wps.status && wps.status !== 'OK' && wps.reason) {
          playabilityReason = wps.reason;
        }
      } catch (e) {
      }
    }
    const err = new Error(
      loginRequired
        ? 'YouTube needs sign-in: ' + lastError
        : playabilityReason || lastError
    );
    err.loginRequired = loginRequired;
    err.permanent = Boolean(playabilityReason);
    throw err;
  }
  async function extract(videoId, reqId) {
    const meta = { posted: false };
    const bundle = await getArmedClient();
    if (SABR_TEST) {
      try {
        const sabr = await resolveSabrConfig(bundle.yt, videoId);
        if (sabr) {
          const c =
            (bundle.yt.session && bundle.yt.session.context.client) || {};
          post({
            sabrConfig: {
              serverAbrStreamingUrl: sabr.serverAbrStreamingUrl,
              ustreamerConfig: sabr.ustreamerConfig,
              poToken: bundle.poToken,
              durationMs: sabr.durationMs,
              clientVersion: c.clientVersion,
              gl: c.gl,
              formats: sabr.formats,
            },
          });
          warn('sabr', 'posted config to RN');
        } else warn('sabr', 'test: no config');
      } catch (e) {
        warn('sabr', 'test fail ' + (e && e.message));
      }
    }
    try {
      return await extractWith(videoId, reqId, bundle, meta);
    } catch (e) {
      if (!e.loginRequired && !e.permanent && armed === bundle) {
        warn('extract', 're-arm after: ' + (e && e.message));
        armed = null;
        const fresh = await getArmedClient();
        return await extractWith(videoId, reqId, fresh, meta);
      }
      throw e;
    }
  }
  async function postEarlyMeta(reqId, videoId) {
    try {
      const target = encodeURIComponent(
        'https://www.youtube.com/watch?v=' + videoId
      );
      const r = await fetch('https://www.youtube.com/oembed?format=json&url=' + target);
      if (!r.ok) return;
      const j = await r.json();
      post({
        reqId,
        partial: true,
        meta: {
          id: videoId,
          title: j.title,
          author: j.author_name,
          thumbnail: j.thumbnail_url,
        },
      });
    } catch (e) {
      log('oembed', 'fail: ' + (e && e.message));
    }
  }
  window.__search = async (reqId, query) => {
    try {
      const yt = await getSearchClient();
      const res = await yt.search(query, { type: 'video' });
      const list = res.videos || res.results || [];
      const results = list
        .map((v) => ({
          id: v.id || v.video_id,
          title: (v.title && (v.title.text || v.title)) || undefined,
          author: (v.author && (v.author.name || v.author)) || undefined,
          durationSec:
            (v.duration && v.duration.seconds) || v.length_seconds || undefined,
        }))
        .filter((v) => v.id)
        .slice(0, 8);
      post({ reqId, search: true, ok: true, results });
    } catch (e) {
      post({ reqId, search: true, ok: false, error: String((e && e.message) || e) });
    }
  };
  window.__extract = async (reqId, videoId) => {
    postEarlyMeta(reqId, videoId);
    try {
      const data = await extract(videoId, reqId);
      post({ reqId, ok: true, data });
    } catch (e) {
      post({ reqId, ok: false, error: String((e && e.message) || e) });
    }
  };
  function normalizeEntry(v) {
    if (!v) return null;
    const pickThumb = (thumbs) =>
      thumbs && thumbs.length ? thumbs[0].url : undefined;
    if (v.id && (v.title || v.duration)) {
      return {
        id: v.id,
        title: (v.title && (v.title.text || (v.title.toString && v.title.toString()))) || undefined,
        channel: (v.author && (v.author.name || v.author)) || undefined,
        durationSec: (v.duration && v.duration.seconds) || undefined,
        thumb: pickThumb(v.thumbnails),
      };
    }
    const id = v.content_id;
    if (!id) return null;
    let title, channel;
    const meta = v.metadata;
    if (meta) {
      const tm = meta.title;
      title = tm && (tm.text || (tm.toString && tm.toString()));
      const am = meta.menu || meta.secondary_metadata;
      channel = am && (am.name || (am.toString && am.toString()));
    }
    const ci = v.content_image;
    const thumb = ci ? pickThumb(ci.image || ci.thumbnails) : undefined;
    return { id, title, channel, durationSec: undefined, thumb };
  }
  window.__playlist = async (reqId, listId) => {
    try {
      const yt = await getSearchClient();
      let playlistRes = await yt.getPlaylist(listId);
      const maxPages = 30;
      const allEntries = [];
      let playlistMeta;
      for (let page = 0; page < maxPages && playlistRes; page++) {
        var items = playlistRes.items || [];
        for (var i = 0; i < items.length; i++) {
          var entry = normalizeEntry(items[i]);
          if (entry) allEntries.push(entry);
        }
        if (!playlistMeta) {
          try {
            var pi = playlistRes.info;
            var pa = pi && pi.author;
            playlistMeta = {
              id: listId,
              title: pi && (pi.title && (pi.title.text || pi.title.toString())) || 'Playlist',
              author: pa && (typeof pa.name === 'string' ? pa.name : (pa.name && (typeof pa.name.text === 'string' ? pa.name.text : pa.name.toString ? pa.name.toString() : undefined))),
              authorAvatar: pa && pa.thumbnails && pa.thumbnails[0] && pa.thumbnails[0].url,
            };
          } catch (e) {
            warn('playlist-meta', 'info err: ' + (e && e.message));
          }
        }
        if (playlistRes.has_continuation) {
          playlistRes = await playlistRes.getContinuation();
        } else {
          break;
        }
      }
      if (allEntries.length === 0) {
        post({ reqId, playlist: true, ok: false, data: null });
        return;
      }
      var fallbackAuthor = playlistMeta && playlistMeta.author;
      if (!fallbackAuthor) {
        var fe = allEntries[0];
        if (fe && fe.channel) fallbackAuthor = typeof fe.channel === 'string' ? fe.channel : undefined;
      }
      post({
        reqId,
        playlist: true,
        ok: true,
        data: {
          id: listId,
          title: (playlistMeta && playlistMeta.title) || 'Playlist',
          author: fallbackAuthor,
          authorAvatar: playlistMeta && playlistMeta.authorAvatar,
          entries: allEntries,
        },
      });
    } catch (e) {
      post({ reqId, playlist: true, ok: false, error: String((e && e.message) || e) });
    }
  };
  boot()
    .then(() => {
      post({ ready: true });
      getSearchClient().catch((e) => warn('warm', e && e.message));
    })
    .catch((e) => warn('boot', 'fail: ' + (e && e.message ? e.message : e)));
</script>
</body>
</html>`;
// RAW_HTML is a fixed local template, never attacker input
const SCRIPTS = RAW_HTML.split('<script>')
  .slice(1)
  .map((chunk) => chunk.split('</script>')[0])
  .join('\n');
export const YT_BOOTSTRAP_JS = `(function () {
  if (window.__nexBooted) return;
  window.__nexBooted = true;
${SCRIPTS}
})();
true;`;
export const YT_EXTRACTOR_HTML = `<!doctype html>
<html>
<head><meta charset="utf-8" /></head>
<body></body>
</html>`;
