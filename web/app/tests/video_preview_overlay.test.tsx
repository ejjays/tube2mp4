import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import VideoPreviewOverlay from '../src/components/modals/VideoPreviewOverlay';
import { clearPreviewCache } from '../src/lib/previewStream';

const jsonResponse = (body: unknown) =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  } as Response);

describe('VideoPreviewOverlay', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearPreviewCache();
  });

  it('plays the proxied stream when it is muxed (no separate audio)', async () => {
    global.fetch = vi.fn().mockReturnValue(
      jsonResponse({
        videoUrl: 'https://localhost:5000/proxy?targetUrl=x&formatId=hd&sig=1',
        audioUrl: null,
      })
    );

    render(
      <VideoPreviewOverlay
        isOpen
        onClose={vi.fn()}
        pageUrl="https://www.threads.com/@a/post/X"
        formatId="hd"
      />
    );

    await waitFor(() => {
      const video = document.querySelector('video');
      expect(video).toBeTruthy();
      expect(video?.getAttribute('src')).toContain('/proxy');
    });
  });

  it('shows an unavailable message for separate video+audio streams', async () => {
    global.fetch = vi
      .fn()
      .mockReturnValue(
        jsonResponse({ videoUrl: 'https://x/v', audioUrl: 'https://x/a' })
      );

    render(
      <VideoPreviewOverlay
        isOpen
        onClose={vi.fn()}
        pageUrl="https://youtube.com/watch?v=x"
        formatId="137"
      />
    );

    expect(
      await screen.findByText(/inline preview isn't available/i)
    ).toBeInTheDocument();
    expect(document.querySelector('video')).toBeNull();
  });

  it('calls onClose from the close button', async () => {
    global.fetch = vi
      .fn()
      .mockReturnValue(
        jsonResponse({ videoUrl: 'https://x/v', audioUrl: 'https://x/a' })
      );
    const onClose = vi.fn();

    render(
      <VideoPreviewOverlay
        isOpen
        onClose={onClose}
        pageUrl="https://t/p"
        formatId="hd"
      />
    );

    // let the resolve settle before interacting
    await screen.findByText(/inline preview isn't available/i);
    fireEvent.click(screen.getByLabelText('Close preview'));
    expect(onClose).toHaveBeenCalled();
  });

  it('renders nothing and does not fetch while closed', () => {
    global.fetch = vi.fn();

    render(
      <VideoPreviewOverlay
        isOpen={false}
        onClose={vi.fn()}
        pageUrl="https://t/p"
        formatId="hd"
      />
    );

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
