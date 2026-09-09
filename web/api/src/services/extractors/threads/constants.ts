export * from '@phantom/extractors/threads/constants';

import { buildPageHeaders } from '@phantom/extractors';

export const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// cdn authorizes media against this origin
export const STREAM_REFERER = 'https://www.threads.com/';

export const HEADERS = buildPageHeaders(DESKTOP_UA);
