import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import StandardQualityPicker from '../src/components/modals/StandardQualityPicker';
import { clearPreviewCache } from '../src/lib/previewStream';

const videoData = {
  title: 'Clip',
  artist: 'Creator',
  thumbnail: 'https://scontent.cdninstagram.com/t.jpg',
  webpageUrl: 'https://www.threads.com/@a/post/PREFETCH',
  formats: [{ formatId: 'hd', quality: 'HD', ext: 'mp4', height: 0 }],
  audioFormats: [{ formatId: '140', quality: '130kbps', ext: 'm4a' }],
};

const renderPicker = () =>
  render(
    <MemoryRouter>
      <StandardQualityPicker
        isOpen
        onClose={vi.fn()}
        selectedFormat="mp4"
        videoData={videoData}
        onSelect={vi.fn()}
      />
    </MemoryRouter>
  );

describe('picker preview prefetch (on intent, not on open)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearPreviewCache();
  });

  it('does not resolve a stream just from opening the picker', () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    } as Response);
    global.fetch = fetchSpy;

    renderPicker();

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('warms the stream when the thumbnail gets hover/focus intent', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ videoUrl: 'https://x/proxy', audioUrl: null }),
    } as unknown as Response);
    global.fetch = fetchSpy;

    renderPicker();
    const trigger = screen.getByLabelText('Play preview');
    // pointer or keyboard intent warms it
    fireEvent.pointerEnter(trigger);
    fireEvent.focus(trigger);

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const calledUrl = String(fetchSpy.mock.calls[0][0]);
    expect(calledUrl).toContain('/stream-urls');
    expect(calledUrl).toContain('formatId=hd');
  });
});
