function hostIn(url: string, hosts: string[]): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hosts.some((h) => hostname === h || hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

export interface RawSocialData {
  title?: string;
  uploader?: string;
  artist?: string;
  channel?: string;
  creator?: string;
  alt_title?: string;
  description?: string;
  uploader_id?: string;
  webpageUrl?: string;
  id?: string;
  thumbnail?: string;
  thumbnails?: Array<{ width?: number; url: string }>;
  metascraper?: {
    author?: string | null;
    title?: string | null;
    image?: string | null;
    publisher?: string | null;
    description?: string | null;
    url?: string | null;
    logo?: string | null;
  } | null;
  [key: string]: unknown;
}

function applySmartFallback(info: RawSocialData): string {
  if (info === null || typeof info !== 'object') {
    return '';
  }
  const { title: rawTitle, alt_title, description } = info;
  const title = typeof rawTitle === 'string' ? rawTitle : '';

  const isGeneric =
    !title ||
    title.toLowerCase() === 'video' ||
    (title.startsWith('Video by') && title.length < 20) ||
    (title.startsWith('Reel by') && title.length < 20) ||
    title.toLowerCase() === 'instagram' ||
    title.toLowerCase() === 'facebook' ||
    (title.toLowerCase().includes('reactions') && title.length < 30) ||
    (title.toLowerCase().includes('views') && title.length < 30);

  if (isGeneric) {
    if (typeof alt_title === 'string' && alt_title.length > 3) return alt_title;

    if (typeof description === 'string' && description.trim()) {
      const firstLine = description.split('\n')[0].trim();
      if (firstLine && firstLine.length > 3) {
        return firstLine.substring(0, 300).trim();
      }
    }
  }
  return title;
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function purgeSocialMetadata(
  title: string,
  author: string | undefined
): string {
  if (title.length > 300) return title.trim();

  let text = title;

  text = text
    .replace(/\\n|\\r|\\t/gu, ' ')
    .replace(/\n|\r|\t/gu, ' ')
    .replace(/\s+/gu, ' ');

  if (author && text.includes(author)) {
    const escapedAuthor = escapeRegExp(author);
    text = text.replace(
      new RegExp(`^${escapedAuthor}\\s*[:|·•-]\\s*`, 'ui'),
      ''
    );
    text = text.replace(
      new RegExp(`\\s*[:|·•-]\\s*${escapedAuthor}$`, 'ui'),
      ''
    );
  }

  // strip fb system prefix
  const prefixMatch = text.match(/^(?:Reel|Video)\s+by\s+/iu);
  if (prefixMatch) {
    const afterPrefix = text.slice(prefixMatch[0].length);
    const sepIdx = afterPrefix.search(/[|·•:-]/u);
    if (sepIdx !== -1) text = afterPrefix.slice(sepIdx + 1);
  }

  text = text.replace(
    /\d{1,20}(?:\.\d{1,20})?[KkM]?(?:\s+na\s+)?(?:views?|reactions?|shares?|likes?|comments?|reaksyon|heart)\b/giu,
    ''
  );

  text = text
    .replace(/[·•|:-]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();

  if (text.length < 100) {
    text = text.replace(/#\w+/gu, '');
  }

  if (text.includes('|') && text.length < 100) {
    const parts = text.split('|');
    const bestPart = parts.find((part) => part.trim().length > 5) || parts[0];
    text = bestPart.trim();
  }

  return text.trim();
}

function guessAuthorFromTitle(title: string): string | undefined {
  let guessedAuthor: string | undefined;

  if (title.includes('|')) {
    const parts = title.split('|').map((part) => part.trim());
    if (
      parts.length >= 3 &&
      parts[parts.length - 1].toLowerCase() === 'facebook'
    ) {
      guessedAuthor = parts[parts.length - 2];
    } else if (parts.length >= 2) {
      guessedAuthor = parts[parts.length - 1];
    }
  } else if (title.includes('•')) {
    const parts = title.split('•').map((part) => part.trim());
    if (parts.length >= 2) {
      const lastPart = parts[parts.length - 1];
      if (lastPart.toLowerCase().includes('reel by')) {
        guessedAuthor = lastPart
          .split(/reel by/iu)
          .pop()
          ?.trim();
      } else {
        guessedAuthor = lastPart.trim();
      }
    }
  } else if (title.toLowerCase().includes('reel by')) {
    guessedAuthor = title
      .split(/reel by/iu)
      .pop()
      ?.trim();
  }

  if (guessedAuthor) {
    const cleanGuess = guessedAuthor.toLowerCase();
    const isTooLong = guessedAuthor.length > 40;
    const isGeneric =
      cleanGuess === 'facebook' ||
      cleanGuess === 'instagram' ||
      cleanGuess.includes('log in');
    if (isTooLong || isGeneric) return undefined;
  }

  return guessedAuthor;
}

function getPlatformFallback(url: string, author?: string): string {
  if (hostIn(url, ['facebook.com', 'fb.watch'])) return author || 'Facebook';
  if (hostIn(url, ['instagram.com'])) return author || 'Instagram';
  if (hostIn(url, ['threads.net', 'threads.com'])) return author || 'Threads';
  if (hostIn(url, ['tiktok.com'])) return author || 'TikTok';
  if (hostIn(url, ['twitter.com', 'x.com'])) return author || 'X';
  return author || 'Social Media';
}

function resolveArtistFallback(
  info: RawSocialData,
  currentAuthor: string | null | undefined
): string {
  let author = currentAuthor || undefined;
  const isInvalid = isGenericPlatformName(author);

  if (isInvalid) {
    author =
      (info.uploader as string) ||
      (info.artist as string) ||
      (info.channel as string) ||
      (info.creator as string) ||
      (info.uploader_id as string);
  }

  if (
    author &&
    typeof author === 'string' &&
    author.toLowerCase() !== 'facebook' &&
    author.toLowerCase() !== 'instagram' &&
    author.toLowerCase() !== 'threads'
  ) {
    return author;
  }

  if (info.webpageUrl && typeof info.webpageUrl === 'string') {
    return getPlatformFallback(info.webpageUrl, author as string);
  }

  return (author as string) || 'Social Media';
}

function isGenericPlatformName(value: string | null | undefined): boolean {
  if (!value) return true;
  const name = value.trim().toLowerCase();
  return (
    name === 'facebook' ||
    name === 'instagram' ||
    name === 'threads' ||
    name === 'twitter' ||
    name === 'bluesky' ||
    name.includes('formerly twitter')
  );
}

// reject engagement/section junk titles
const isJunkTitle = (value: string): boolean => {
  const low = value.trim().toLowerCase();
  return (
    !low ||
    low === 'related videos' ||
    low === 'suggested for you' ||
    low === 'watch' ||
    /^\d[\d.,]*[kmb]?\s*(?:views?|reactions?|likes?|comments?|shares?)\b/u.test(
      low
    ) ||
    /\b(?:views?|reactions?)\s*·/u.test(low)
  );
};

export const normalizeArtist = (info: RawSocialData): string => {
  const isYouTube = info.webpageUrl
    ? hostIn(info.webpageUrl, ['youtube.com', 'youtu.be'])
    : false;

  // trust uploader fields; skip title guessing on yt
  if (isYouTube) {
    const candidates: Array<unknown> = [
      info.uploader,
      info.author,
      info.channel,
      info.creator,
    ];
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        const value = candidate.trim();
        // reject YT handles
        const isHandleSlug =
          !value.includes(' ') &&
          value === value.toLowerCase() &&
          /^[a-z0-9._]+-[a-z0-9]{4,6}$/u.test(value);
        if (!isHandleSlug) return value;
      }
    }
    return 'YouTube User';
  }

  const title = info.metascraper?.title || info.title || '';
  let author = info.metascraper?.author || info.metascraper?.publisher;

  const isInvalid = isGenericPlatformName(author);

  if (isInvalid) {
    const guessed = guessAuthorFromTitle(title);
    if (guessed) author = guessed;
  }

  return resolveArtistFallback(info, author);
};

export const normalizeTitle = (info: RawSocialData): string => {
  const author = normalizeArtist(info);

  // prefer metascraper title; strip seo noise
  const rawTitle = info.metascraper?.title || applySmartFallback(info);
  let finalTitle = rawTitle;
  if (info.metascraper?.title) {
    if (finalTitle.includes('|')) {
      const parts = finalTitle.split('|').map((part) => part.trim());
      // split reel `A | B`; drop platform noise parts
      const filtered = parts.filter((part) => {
        const clean = part.toLowerCase();
        return (
          clean !== 'facebook' &&
          clean !== 'instagram' &&
          part.trim() !== author &&
          !clean.includes('reel by') &&
          !clean.includes('video by') &&
          !isJunkTitle(part)
        );
      });

      if (filtered.length > 0) {
        finalTitle = filtered[0]; // take first real part
      } else {
        finalTitle = ''; // all parts junk/author -> let fallback decide
      }
    }
  }

  if (finalTitle && finalTitle.length < 300) {
    finalTitle = purgeSocialMetadata(finalTitle, author);
  }

  // drop engagement/section junk; prefer the author name
  if (isJunkTitle(finalTitle)) {
    const generic = ['facebook', 'instagram', 'tiktok', 'x', 'social media'];
    finalTitle =
      author && !generic.includes(author.toLowerCase()) ? author : '';
  }

  if (!finalTitle || finalTitle.length < 2) {
    if (info.id && typeof info.id === 'string') return `Video_${info.id}`;
    finalTitle = `Video_${Date.now()}`;
  }

  return finalTitle;
};
