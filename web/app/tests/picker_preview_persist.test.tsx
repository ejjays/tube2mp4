import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

// stub overlay to observe open state
// (real overlay uses AnimatePresence which removes async)
vi.mock('../src/components/modals/VideoPreviewOverlay', () => ({
  default: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="preview-open" /> : null,
}));

import StandardQualityPicker from '../src/components/modals/StandardQualityPicker';
import { clearPreviewCache } from '../src/lib/previewStream';

const baseVideoData = {
  title: 'Clip',
  artist: 'Creator',
  thumbnail: 'https://scontent.cdninstagram.com/t.jpg',
  webpageUrl: 'https://www.threads.com/@a/post/PERSIST',
  formats: [{ formatId: 'hd', quality: 'HD', ext: 'mp4', height: 0 }],
  audioFormats: [{ formatId: '140', quality: '130kbps', ext: 'm4a' }],
};

const renderWith = (data: typeof baseVideoData) => (
  <MemoryRouter>
    <StandardQualityPicker
      isOpen
      onClose={vi.fn()}
      selectedFormat="mp4"
      videoData={data}
      onSelect={vi.fn()}
    />
  </MemoryRouter>
);

describe('picker preview persistence', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearPreviewCache();
  });

  it('keeps the preview open when videoData updates (late SSE metadata)', () => {
    const { rerender } = render(renderWith(baseVideoData));

    fireEvent.click(screen.getByLabelText('Play preview'));
    expect(screen.getByTestId('preview-open')).toBeInTheDocument();

    // late update must not dismiss preview
    rerender(renderWith({ ...baseVideoData, title: 'Updated Title' }));

    expect(screen.getByTestId('preview-open')).toBeInTheDocument();
  });
});
