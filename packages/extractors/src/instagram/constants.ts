import { DESKTOP_UA } from '../shared/util.js';

export { DESKTOP_UA };

export const IG_APP_ID = '936619743392459';
export const POST_DOC_ID = '8845758582119845';
export const LOGGED_OUT_DOC_ID = '27130156389949648';
export const LOGGED_OUT_FRIENDLY =
  'PolarisLoggedOutDesktopWWWPostRootContentQuery';
export const SHORTCODE_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
export const REFERER = 'https://www.instagram.com/';

export const MOBILE_UA =
  'Instagram 275.0.0.27.98 Android (33/13; 280dpi; 720x1423; Xiaomi; Redmi 7; onclite; qcom; en_US; 458229237)';

export const WEB_HEADERS: Record<string, string> = {
  'User-Agent': DESKTOP_UA,
  'x-ig-app-id': IG_APP_ID,
  'Accept-Language': 'en-US,en;q=0.9',
  'Sec-Fetch-Site': 'same-origin',
};

export const MOBILE_HEADERS: Record<string, string> = {
  'User-Agent': MOBILE_UA,
  'x-ig-app-id': IG_APP_ID,
  'x-ig-app-locale': 'en_US',
  'x-ig-device-locale': 'en_US',
  'x-ig-mapped-locale': 'en_US',
  'Accept-Language': 'en-US',
  'x-fb-http-engine': 'Liger',
};

export const PAGE_HEADERS: Record<string, string> = {
  'User-Agent': DESKTOP_UA,
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-GB,en;q=0.9',
};
