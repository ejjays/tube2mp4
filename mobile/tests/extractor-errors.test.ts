import { describe, it, expect } from 'vitest';
import {
  notFound,
  privateVideo,
  loginRequired,
  geoBlocked,
  ageRestricted,
  restricted,
  noVideo,
  networkError,
  rateLimited,
  serverError,
  temporaryError,
  fromStatus,
  classifyThrown,
} from '@phantom/extractors';
import { ExtractorError } from '@phantom/extractors';
import { mapYtError } from '../src/extractors/youtube/bridge';

describe('extractor error helpers', () => {
  it('marks permanent failures as non-retryable', () => {
    for (const err of [
      notFound('YouTube'),
      privateVideo('YouTube'),
      loginRequired('YouTube'),
      geoBlocked('YouTube'),
      ageRestricted('YouTube'),
      restricted('YouTube'),
      noVideo('YouTube'),
    ]) {
      expect(err.retryable).toBe(false);
    }
  });

  it('marks transient failures as retryable', () => {
    for (const err of [
      networkError('YouTube'),
      rateLimited('YouTube'),
      serverError('YouTube'),
      temporaryError('YouTube'),
    ]) {
      expect(err.retryable).toBe(true);
    }
  });

  it('flags benign content-state (and client network) fails as expected', () => {
    for (const err of [
      notFound('YouTube'),
      privateVideo('YouTube'),
      loginRequired('YouTube'),
      geoBlocked('YouTube'),
      ageRestricted('YouTube'),
      restricted('YouTube'),
      networkError('YouTube'),
    ]) {
      expect(err.expected).toBe(true);
    }
  });

  it('treats transient + content-state fails as expected (no crash reports)', () => {
    for (const err of [
      noVideo('YouTube'),
      rateLimited('YouTube'),
      serverError('YouTube'),
      temporaryError('YouTube'),
    ]) {
      expect(err.expected).toBe(true);
    }
  });

  it('keeps expected/retryable orthogonal', () => {
    expect(noVideo('YouTube').retryable).toBe(false);
    expect(rateLimited('YouTube').retryable).toBe(true);
    expect(serverError('YouTube').retryable).toBe(true);
    expect(temporaryError('YouTube').retryable).toBe(true);
  });

  it('names the platform + reason in the message', () => {
    expect(notFound('TikTok').message).toMatch(/TikTok/u);
    expect(notFound('TikTok').message).toMatch(/removed/u);
    expect(privateVideo('Instagram').message).toMatch(/private/u);
    expect(geoBlocked('YouTube').message).toMatch(/region/u);
  });

  it('adapts the noun for audio platforms', () => {
    expect(notFound('SoundCloud', 'track').message).toMatch(/track/u);
    expect(notFound('SoundCloud', 'track').message).not.toMatch(/video/u);
    expect(noVideo('SoundCloud', 'track').message).toMatch(/track/u);
  });

  it('appends an optional restricted reason', () => {
    expect(restricted('Dailymotion', 'by its owner').message).toMatch(
      /restricted by its owner/u
    );
    expect(restricted('Vimeo').message).toMatch(/restricted and/u);
  });

  it('maps http status to the right typed error', () => {
    expect(fromStatus(404, 'X').message).toMatch(/removed/u);
    expect(fromStatus(404, 'X').retryable).toBe(false);
    expect(fromStatus(410, 'X').retryable).toBe(false);
    expect(fromStatus(403, 'X').message).toMatch(/login/u);
    expect(fromStatus(401, 'X').retryable).toBe(false);
    expect(fromStatus(429, 'X').retryable).toBe(true);
    expect(fromStatus(429, 'X').message).toMatch(/busy/u);
    expect(fromStatus(503, 'X').retryable).toBe(true);
    expect(fromStatus(503, 'X').message).toMatch(/server/u);
    expect(fromStatus(418, 'X').message).toMatch(/find a downloadable/u);
  });

  it('passes typed errors through classifyThrown unchanged', () => {
    const original = privateVideo('YouTube');
    expect(classifyThrown(original, 'YouTube')).toBe(original);
  });

  it('classifies network-ish throws as retryable network errors', () => {
    const err = classifyThrown(new Error('Network request failed'), 'YouTube');
    expect(err.retryable).toBe(true);
    expect(err.message).toMatch(/reach YouTube/u);
  });

  it('classifies unknown throws as retryable temporary errors', () => {
    const err = classifyThrown(new Error('weird parse glitch'), 'YouTube');
    expect(err.retryable).toBe(true);
    expect(err).toBeInstanceOf(ExtractorError);
  });
});

describe('youtube reason mapping', () => {
  it('maps playabilityStatus reasons to the right typed error', () => {
    expect(mapYtError('This video is private').message).toMatch(/private/u);
    expect(mapYtError('This video is private').retryable).toBe(false);
    expect(mapYtError('Sign in to confirm your age').message).toMatch(
      /age-restricted/u
    );
    expect(
      mapYtError('not made this video available in your country').message
    ).toMatch(/region/u);
    const members = mapYtError(
      'Join this channel to get access to members-only content'
    );
    expect(members.message).toMatch(/members/u);
    expect(members.retryable).toBe(false);
    expect(
      mapYtError('This video has been removed by the uploader').message
    ).toMatch(/removed/u);
    expect(
      mapYtError('Please sign in to confirm you are not a bot').retryable
    ).toBe(true);
    expect(mapYtError(undefined).message).toMatch(/find a downloadable/u);
  });
});
