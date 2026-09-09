import { describe, it, expect } from 'vitest';
import { deriveAudioTracks } from '../src/components/modals/SharedComponents';

/**
 * The dub control is only meant to appear when a video actually exposes more
 * than one audio language. deriveAudioTracks drives that: it must collapse to
 * the distinct languages, float the original first, and stay empty for
 * ordinary single-track videos.
 */
describe('deriveAudioTracks', () => {
  it('returns empty for formats without language metadata (control hidden)', () => {
    expect(
      deriveAudioTracks([{ formatId: '140', ext: 'm4a' } as never])
    ).toHaveLength(0);
  });

  it('returns a single track when only one language is present', () => {
    const tracks = deriveAudioTracks([
      { language: 'en', isOriginal: true } as never,
      { language: 'en' } as never,
    ]);
    expect(tracks).toHaveLength(1);
    expect(tracks[0].language).toBe('en');
  });

  it('collapses to distinct languages and floats the original first', () => {
    const tracks = deriveAudioTracks([
      { language: 'es-419' } as never,
      { language: 'en', isOriginal: true } as never,
      { language: 'es-419' } as never,
      { language: 'hi' } as never,
    ]);
    expect(tracks).toHaveLength(3);
    expect(tracks[0].language).toBe('en');
    expect(tracks[0].isOriginal).toBe(true);
  });

  it('labels known codes and falls back for unknown ones', () => {
    const tracks = deriveAudioTracks([
      { language: 'en', isOriginal: true } as never,
      { language: 'es-419' } as never,
      { language: 'zz' } as never,
    ]);
    const byCode = Object.fromEntries(
      tracks.map((t) => [t.language, t.languageName])
    );
    expect(byCode['es-419']).toBe('Spanish (Latin America)');
    expect(byCode['zz']).toBe('ZZ');
  });

  it('prefers a backend-provided display name', () => {
    const tracks = deriveAudioTracks([
      { language: 'pt-BR', languageName: 'Portuguese (Brazil)' } as never,
      { language: 'en', isOriginal: true } as never,
    ]);
    const pt = tracks.find((t) => t.language === 'pt-BR');
    expect(pt?.languageName).toBe('Portuguese (Brazil)');
  });
});
