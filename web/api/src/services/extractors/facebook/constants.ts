export * from '@phantom/extractors/facebook/constants';

import { buildPageHeaders } from '@phantom/extractors';

export const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

export const HEADERS = buildPageHeaders(DESKTOP_UA);
