import { beforeAll, afterEach, afterAll, vi, expect } from 'vitest';
import { setupServer } from 'msw/node';
import { HttpResponse, http } from 'msw';
import Redis from 'ioredis-mock';

vi.mock('ioredis', () => ({
  default: Redis,
  Redis,
}));

// mock libsql
vi.mock('@libsql/client', () => ({
  createClient: vi.fn().mockReturnValue({
    // skipcq: JS-0116
    execute: vi.fn().mockImplementation(async (options) => {
      await Promise.resolve();
      const sql = typeof options === 'string' ? options : options.sql;
      console.debug(`[MockDB] Executing: ${sql.substring(0, 100)}...`);
      return { rows: [] };
    }),
  }),
}));

import db from '../src/utils/infra/db.util.js';
import { resetSSE } from '../src/utils/network/sse.util.js';
import createRedisClient from '../src/utils/infra/redis.util.js';

interface DBClient {
  execute: (
    options: string | { sql: string; args?: unknown[] }
  ) => Promise<unknown>;
}

async function initTestDb(client: DBClient) {
  try {
    await client.execute(`CREATE TABLE IF NOT EXISTS spotify_mappings (
      url TEXT PRIMARY KEY,
      title TEXT,
      artist TEXT,
      album TEXT,
      imageUrl TEXT,
      duration INTEGER,
      isrc TEXT,
      previewUrl TEXT,
      youtubeUrl TEXT,
      formats TEXT,
      audioFormats TEXT,
      audioFeatures TEXT,
      year TEXT,
      timestamp INTEGER
    )`);
    await client.execute(
      'CREATE INDEX IF NOT EXISTS idx_spotify_isrc ON spotify_mappings(isrc)'
    );
    await client.execute(
      'CREATE INDEX IF NOT EXISTS idx_spotify_youtube ON spotify_mappings(youtubeUrl)'
    );

    await client.execute(`CREATE TABLE IF NOT EXISTS configs (
      key TEXT PRIMARY KEY,
      value TEXT
    )`);

    await client.execute(`CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      url TEXT,
      created_at INTEGER
    )`);

    await client.execute(`CREATE TABLE IF NOT EXISTS volatile_links (
      url TEXT PRIMARY KEY,
      expires_at INTEGER,
      provider TEXT
    )`);

    console.log('[TestDB] Local SQLite schema initialized');
  } catch (error) {
    console.error('[TestDB] Initialization failed:', (error as Error).message);
  }
}

const isE2EMode =
  process.env.VITEST_INCLUDE_E2E === '1' || process.env.E2E === '1';

vi.mock('youtubei.js', async (importOriginal) => {
  if (isE2EMode) {
    return await importOriginal<typeof import('youtubei.js')>();
  }
  const actual = await importOriginal<typeof import('youtubei.js')>();
  // mock streaming data
  const mockStreamingData = {
    formats: [
      {
        itag: 18,
        url: 'https://rr5---sn-n4v7kn7z.googlevideo.com/videoplayback?test18',
        mime_type: 'video/mp4; codecs="avc1.42001E, mp4a.40.2"',
        width: 640,
        height: 360,
        quality_label: '360p',
        has_video: true,
        has_audio: true,
      },
      {
        itag: 136,
        url: 'https://rr5---sn-n4v7kn7z.googlevideo.com/videoplayback?test136',
        mime_type: 'video/mp4; codecs="avc1.4d401f"',
        width: 1280,
        height: 720,
        quality_label: '720p',
        has_video: true,
        has_audio: false,
      },
      {
        itag: 137,
        url: 'https://rr5---sn-n4v7kn7z.googlevideo.com/videoplayback?test137',
        mime_type: 'video/mp4; codecs="avc1.640028"',
        width: 1920,
        height: 1080,
        quality_label: '1080p',
        has_video: true,
        has_audio: false,
      },
    ],
    adaptive_formats: [],
  };
  const mockBasicInfoFull = {
    basic_info: {
      id: 'nTbA7qrEsP0',
      title: 'Awit Ng Bayan (Mocked)',
      author: 'Victory Worship',
      duration: 338,
      thumbnail: [{ url: 'https://example.com/thumb.jpg' }],
    },
    streaming_data: mockStreamingData,
  };
  return {
    ...actual,
    Innertube: {
      create: vi.fn().mockResolvedValue({
        search: vi.fn().mockResolvedValue({
          videos: [
            {
              id: 'nTbA7qrEsP0',
              title: 'Awit Ng Bayan (Mocked)',
              author: { name: 'Victory Worship' },
              thumbnails: [{ url: 'https://example.com/thumb.jpg' }],
              duration: { seconds: 338 },
            },
          ],
        }),
        getInfo: vi.fn().mockResolvedValue(mockBasicInfoFull),
        getBasicInfo: vi.fn().mockResolvedValue(mockBasicInfoFull),
      }),
    },
  };
});

process.env.SPOTIFY_CLIENT_ID = 'mock-id';
process.env.SPOTIFY_CLIENT_SECRET = 'mock-secret';

vi.mock('better-sse', () => ({
  createSession: vi.fn().mockReturnValue({
    push: vi.fn(),
    on: vi.fn(),
  }),
  createChannel: vi.fn().mockReturnValue({
    register: vi.fn(),
    broadcast: vi.fn(),
  }),
}));

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection at:', reason);
});

export const handlers = [
  http.get('https://www.youtube.com/watch', () => {
    return new HttpResponse(
      '<html><head><title>Awit Ng Bayan (Mocked)</title><meta name="author" content="Victory Worship"></head><body></body></html>',
      { headers: { 'Content-Type': 'text/html' } }
    );
  }),
  http.get('https://youtu.be/:id', () => {
    return new HttpResponse(
      '<html><head><title>Awit Ng Bayan (Mocked)</title><meta name="author" content="Victory Worship"></head><body></body></html>',
      { headers: { 'Content-Type': 'text/html' } }
    );
  }),
  http.post('https://www.youtube.com/youtubei/v1/player', () => {
    return HttpResponse.json({
      videoDetails: {
        videoId: 'nTbA7qrEsP0',
        title: 'Awit Ng Bayan (Mocked)',
        author: 'Victory Worship',
        lengthSeconds: '338',
        thumbnail: {
          thumbnails: [{ url: 'https://example.com/thumb.jpg' }],
        },
      },
      streamingData: {
        formats: [
          {
            itag: 18,
            url: 'https://rr5---sn-n4v7kn7z.googlevideo.com/videoplayback?test',
            mimeType: 'video/mp4; codecs="avc1.42001E, mp4a.40.2"',
            width: 640,
            height: 360,
          },
        ],
      },
    });
  }),
  http.get('https://api.spotify.com/v1/tracks/:id', (req) => {
    if (req.params.id === 'error404')
      return new HttpResponse('Not Found', { status: 404 });
    return HttpResponse.json({
      name: 'Awit Ng Bayan (Mocked)',
      artists: [{ name: 'Victory Worship' }],
      external_ids: { isrc: 'FR2X41721331' },
      album: {
        name: 'Awit Ng Bayan',
        images: [{ url: 'https://example.com/cover.jpg' }],
      },
      duration_ms: 338000,
      preview_url: 'https://p.scdn.co/mp3-preview/mocked',
    });
  }),
  http.get('https://api.deezer.com/track/isrc:isrc', () => {
    return HttpResponse.json({
      isrc: 'FR2X41721331',
      preview: 'https://p.scdn.co/mp3-preview/mocked',
    });
  }),
  http.get('https://api.deezer.com/search', () => {
    return HttpResponse.json({
      data: [
        {
          id: '12345',
          title: 'Mocked Song',
          artist: { name: 'Mocked Artist' },
          preview: 'https://p.scdn.co/mp3-preview/mocked',
          duration: 338,
        },
      ],
    });
  }),
  http.get('https://api.deezer.com/track/:id', () => {
    return HttpResponse.json({
      isrc: 'FR2X41721331',
      preview: 'https://p.scdn.co/mp3-preview/mocked',
    });
  }),
  http.get('https://itunes.apple.com/search', () => {
    return HttpResponse.json({
      results: [
        {
          isrc: 'FR2X41721331',
          previewUrl: 'https://p.scdn.co/mp3-preview/mocked',
          trackTimeMillis: 338000,
        },
      ],
    });
  }),
  http.post('https://accounts.spotify.com/api/token', () => {
    return HttpResponse.json({
      access_token: 'mock-token',
      token_type: 'Bearer',
      expires_in: 3600,
    });
  }),
  http.get('https://api.spotify.com/v1/audio-features/:id', () => {
    return HttpResponse.json({
      danceability: 0.5,
      energy: 0.5,
      key: 5,
      loudness: -5,
      mode: 1,
      speechiness: 0.05,
      acousticness: 0.2,
      instrumentalness: 0,
      liveness: 0.1,
      valence: 0.5,
      tempo: 120,
      id: '1xwtOTVFN4MsGEKpGyKfIV',
      duration_ms: 338000,
    });
  }),
  http.get('https://open.spotify.com/embed/track/:id', () => {
    return new HttpResponse(
      `<html><body><script id="resource">${encodeURIComponent(JSON.stringify({ preview_url: 'https://p.scdn.co/mp3-preview/mocked' }))}</script></body></html>`,
      {
        headers: { 'Content-Type': 'text/html' },
      }
    );
  }),
  http.get('https://open.spotify.com/oembed', (req) => {
    const url = new URL(req.request.url);
    const target = url.searchParams.get('url');
    if (target?.includes('error404'))
      return new HttpResponse('Not Found', { status: 404 });
    return HttpResponse.json({
      title: 'Awit Ng Bayan (Mocked)',
      thumbnail_url: 'https://example.com/cover.jpg',
    });
  }),
  http.get(
    'https://customer.api.soundcharts.com/api/v2.25/song/by-platform/spotify/:id',
    (req) => {
      if (req.params.id === 'error404')
        return new HttpResponse('Not Found', { status: 404 });
      return HttpResponse.json({
        object: {
          name: 'Awit Ng Bayan (Mocked)',
          artists: [{ name: 'Victory Worship' }],
          isrc: { value: 'FR2X41721331' },
          duration: 338,
          previewUrl: 'https://p.scdn.co/mp3-preview/mocked',
        },
      });
    }
  ),
  http.get('https://api.odesli.co/v1-alpha.1/links', (req) => {
    const url = new URL(req.request.url);
    const target = url.searchParams.get('url');
    if (target?.includes('error404'))
      return new HttpResponse('Not Found', { status: 404 });
    return HttpResponse.json({
      entitiesByUniqueId: {
        mock: {
          title: 'Awit Ng Bayan (Mocked)',
          artistName: 'Victory Worship',
          platforms: ['spotify'],
          isrc: 'FR2X41721331',
        },
      },
      linksByPlatform: {
        youtube: { url: 'https://youtube.com/watch?v=nTbA7qrEsP0' },
      },
    });
  }),
  http.get('https://soundcloud.com/', () => {
    return new HttpResponse(
      '<html><body>client_id:"ceeWbO4nf8MvuTeipNw0E3Lkh3NNxzMy"</body></html>',
      {
        headers: { 'Content-Type': 'text/html' },
      }
    );
  }),
  http.get('https://www.googleapis.com/youtube/v3/search', () => {
    return HttpResponse.json({
      items: [
        {
          id: { videoId: 'nAC_qg36itU' },
          snippet: {
            title: 'Awit Ng Bayan (Mocked)',
            channelTitle: 'Victory Worship',
          },
        },
      ],
    });
  }),
  http.post('https://api.groq.com/**', () => HttpResponse.json({})),
  http.post('https://aiplatform.googleapis.com/**', () =>
    HttpResponse.json({})
  ),
  http.get('https://vt.tiktok.com/ZS9PxUwTM/', () => {
    return HttpResponse.redirect(
      'https://www.tiktok.com/@test/video/123456',
      302
    );
  }),
  http.get('https://www.tiktok.com/@test/video/123456', () => {
    const universal = {
      __DEFAULT_SCOPE__: {
        'webapp.video-detail': {
          itemInfo: {
            itemStruct: {
              id: '123456',
              desc: 'Test Title',
              author: { uniqueId: 'test', nickname: 'Test Author' },
              video: {
                duration: 15,
                width: 720,
                height: 1280,
                cover: 'https://thumb.jpg',
                playAddr: 'https://video.tiktok.com/v/test.mp4',
                codecType: 'h264',
                bitrateInfo: [
                  {
                    Bitrate: 1000000,
                    GearName: 'normal_720_0',
                    CodecType: 'h264',
                    Format: 'mp4',
                    PlayAddr: {
                      Width: 720,
                      Height: 1280,
                      DataSize: 500000,
                      UrlList: ['https://video.tiktok.com/v/test720.mp4'],
                    },
                  },
                  {
                    Bitrate: 500000,
                    GearName: 'lowest_540_0',
                    CodecType: 'h264',
                    Format: 'mp4',
                    PlayAddr: {
                      Width: 576,
                      Height: 1024,
                      DataSize: 250000,
                      UrlList: ['https://video.tiktok.com/v/test540.mp4'],
                    },
                  },
                ],
              },
            },
          },
        },
      },
    };
    return new HttpResponse(
      `<html><body><script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${JSON.stringify(universal)}</script></body></html>`,
      { headers: { 'Content-Type': 'text/html' } }
    );
  }),
  http.get('https://www.tiktok.com/@error/video/404', () => {
    return new HttpResponse('Not Found', { status: 404 });
  }),
  http.get('https://www.tiktok.com/@error/video/malformed', () => {
    return new HttpResponse('<html><body>No data here</body></html>', {
      headers: { 'Content-Type': 'text/html' },
    });
  }),
  http.get('https://www.facebook.com/share/r/1KJUSQ3JkR/', () => {
    // real 2026 reel: hd+sd, no audiourl;
    // embedded thumbnail must not hijack video
    return new HttpResponse(
      '<html><head><meta property="og:title" content="Test Title | Test User | Facebook"></head><body><script>{"owner":{"__typename":"User","name":"Test User"}} {"message":{"text":"Test Title"}} {"image":{"uri":"https://scontent.fbcdn.net/thumb.jpg"}} {"video_id":"123456","browser_native_hd_url":"https://video.fbcdn.net/hd.mp4","browser_native_sd_url":"https://video.fbcdn.net/sd.mp4","dash_manifest_xml_string":"<MPD></MPD>"}</script></body></html>',
      { headers: { 'Content-Type': 'text/html' } }
    );
  }),
  http.get('https://www.facebook.com/watch/', (req) => {
    const url = new URL(req.request.url);
    const videoId = url.searchParams.get('v');
    if (videoId === '404')
      return new HttpResponse('Not Found', { status: 404 });
    if (videoId === 'bad')
      return new HttpResponse('<html><body>No data</body></html>', {
        headers: { 'Content-Type': 'text/html' },
      });
    return new HttpResponse('OK');
  }),
  // oembed maps shortcode -> media id
  http.get('https://i.instagram.com/api/v1/oembed/', () => {
    return HttpResponse.json({ media_id: '123456_789' });
  }),
  // mobile private api, primary path
  http.get('https://i.instagram.com/api/v1/media/:mediaId/info/', () => {
    return HttpResponse.json({
      items: [
        {
          code: 'DFQe23tOWKz',
          pk: '123456',
          caption: { text: 'Test Title #awesome' },
          user: { full_name: 'Test User', username: 'test_user' },
          image_versions2: {
            candidates: [
              {
                url: 'https://scontent.cdninstagram.com/thumb.jpg',
                width: 1080,
                height: 1920,
              },
            ],
          },
          video_versions: [
            {
              id: 'sd',
              url: 'https://scontent.cdninstagram.com/v/test_sd.mp4',
              width: 480,
              height: 854,
            },
            {
              id: 'hd',
              url: 'https://scontent.cdninstagram.com/v/test.mp4',
              width: 1080,
              height: 1920,
            },
          ],
        },
      ],
    });
  }),
  // post page carries graphql bootstrap tokens
  http.get('https://www.instagram.com/p/:shortcode/', () => {
    return new HttpResponse(
      '<html><body><script>["LSD",[],{"token":"test_lsd"},258];["InstagramSecurityConfig",[],{"csrf_token":"test_csrf"},259];["DGWWebConfig",[],{"appId":"936619743392459"},260];</script></body></html>',
      { headers: { 'Content-Type': 'text/html' } }
    );
  }),
  // logged-out /api/graphql, no-cookie path
  http.post('https://www.instagram.com/api/graphql', () => {
    return HttpResponse.json({
      data: {
        xig_polaris_media: {
          if_not_gated_logged_out: {
            code: 'DFQe23tOWKz',
            pk: '123456',
            caption: { text: 'Test Title #awesome' },
            user: { username: 'test_user', full_name: 'Test User' },
            image_versions2: {
              candidates: [
                {
                  url: 'https://scontent.cdninstagram.com/thumb.jpg',
                  width: 1080,
                  height: 1920,
                },
              ],
            },
            video_versions: [
              {
                id: 'sd',
                url: 'https://scontent.cdninstagram.com/v/test_sd.mp4',
                width: 480,
                height: 854,
              },
              {
                id: 'hd',
                url: 'https://scontent.cdninstagram.com/v/test.mp4',
                width: 1080,
                height: 1920,
              },
            ],
          },
        },
      },
    });
  }),
  // captioned embed, last resort
  http.get(
    'https://www.instagram.com/reel/DFQe23tOWKz/embed/captioned/',
    () => {
      return new HttpResponse(
        '<html><head><meta property="og:title" content="Test Title #awesome"></head><body><script>{"video_url":"https://scontent.cdninstagram.com/v/test.mp4"}</script></body></html>',
        { headers: { 'Content-Type': 'text/html' } }
      );
    }
  ),
  // size probe for cdn assets
  http.head('https://scontent.cdninstagram.com/*', () => {
    return new HttpResponse(null, { headers: { 'content-length': '1048576' } });
  }),
];

export const server = setupServer(...handlers);

beforeAll(async () => {
  const testPath = expect.getState().testPath;
  const isLiveTest = testPath?.includes('live.test.ts');
  const isE2ETest = testPath?.includes('/e2e/');

  if (isE2EMode && isE2ETest) {
    return;
  }

  if (!isLiveTest) {
    server.listen({ onUnhandledRequest: 'bypass' });
    if (db) {
      await initTestDb(db);
    }
  }
});

afterEach(async () => {
  server.resetHandlers();
  resetSSE();
  await createRedisClient('security').del('media:active');
});

afterAll(() => {
  server.close();
});
