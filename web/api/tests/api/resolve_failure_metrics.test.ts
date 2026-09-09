import { describe, it, expect, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../setup.js';
import {
  fetchIsrcFromDeezer,
  fetchIsrcFromItunes,
  fetchFromOdesli,
} from '../../src/services/spotify/external.js';
import {
  getMetrics,
  resetMetrics,
} from '../../src/utils/infra/metrics.util.js';

describe('per-source resolution failure metrics', () => {
  beforeEach(() => {
    resetMetrics();
  });

  it('labels a Deezer failure as resolve:deezer', async () => {
    server.use(
      http.get('https://api.deezer.com/search', () => HttpResponse.error())
    );
    expect(await fetchIsrcFromDeezer('Song', 'Artist')).toBeNull();
    expect(getMetrics().failures['resolve:deezer']).toBe(1);
  });

  it('labels an iTunes failure as resolve:itunes', async () => {
    server.use(
      http.get('https://itunes.apple.com/search', () => HttpResponse.error())
    );
    expect(await fetchIsrcFromItunes('Song', 'Artist')).toBeNull();
    expect(getMetrics().failures['resolve:itunes']).toBe(1);
  });

  it('labels an Odesli failure as resolve:odesli', async () => {
    server.use(
      http.get('https://api.odesli.co/v1-alpha.1/links', () =>
        HttpResponse.error()
      )
    );
    const res = await fetchFromOdesli(
      'https://open.spotify.com/track/1xwtOTVFN4MsGEKpGyKfIV'
    );
    expect(res).toBeNull();
    expect(getMetrics().failures['resolve:odesli']).toBe(1);
  });
});
