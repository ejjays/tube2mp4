import { describe, it, expect } from 'vitest';
import {
  parseTrackId,
  parseEmbedHtml,
  metaFromEmbed,
  metaFromOdesli,
  mergeSpotifyMeta,
  cleanSpotifyTitle,
} from '../src/spotify.js';

describe('spotify shared helpers', () => {
  it.each([
    ['https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQ3', '4uLU6hMCjMI75M1A2tKUQ3'],
    ['https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQ3', '4uLU6hMCjMI75M1A2tKUQ3'],
    ['spotify:track:4uLU6hMCjMI75M1A2tKUQ3', '4uLU6hMCjMI75M1A2tKUQ3'],
    ['https://open.spotify.com/album/abc', null],
  ])('parseTrackId(%s) -> %s', (url, expected) => {
    expect(parseTrackId(url)).toBe(expected);
  });

  it('parseEmbedHtml reads __NEXT_DATA__ entity', () => {
    const html = `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
      props: {
        pageProps: {
          state: {
            data: {
              entity: {
                name: 'Song Title',
                artists: [{ name: 'Artist' }],
                coverArt: { sources: [{ url: 'https://cover.jpg' }] },
              },
            },
          },
        },
      },
    })}</script></body></html>`;
    expect(parseEmbedHtml(html)).toMatchObject({
      title: 'Song Title',
      artist: 'Artist',
    });
    expect(parseEmbedHtml('<html></html>')).toBeNull();
  });

  it('mergeSpotifyMeta prefers api > embed > odesli', () => {
    const merged = mergeSpotifyMeta(
      'id1',
      { title: 'Embed Title', artist: 'Embed Artist', cover: 'embed.jpg' },
      {
        id: 'id1',
        title: 'API Title',
        artist: 'API Artist',
        album: 'Album',
        cover: 'api.jpg',
        durationMs: 200000,
        isrc: 'US123',
      },
      { title: 'Odesli Title', artist: 'Odesli Artist' }
    );
    expect(merged).toMatchObject({
      title: 'API Title',
      artist: 'API Artist',
      cover: 'api.jpg',
      isrc: 'US123',
    });
    expect(mergeSpotifyMeta('id1', null, null, null)).toBeNull();
  });

  it('metaFromEmbed / metaFromOdesli reject incomplete data', () => {
    expect(metaFromEmbed('id1', { title: 'Only title' })).toBeNull();
    expect(metaFromOdesli('id1', { title: 'Only title' })).toBeNull();
    expect(
      metaFromOdesli('id1', { title: 'T', artist: 'A' })
    ).toMatchObject({ title: 'T', artist: 'A' });
  });

  it('cleanSpotifyTitle strips bracket suffixes', () => {
    expect(cleanSpotifyTitle('Song (Remastered) [2020]')).toBe('Song');
  });
});
