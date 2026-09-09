import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import StandardQualityPicker from '../src/components/modals/StandardQualityPicker';
import MobileSpotifyPicker from '../src/components/modals/MobileSpotifyPicker';

/**
 * H8: the quality pickers are the core download flow but were unusable by
 * keyboard / screen-reader users — no dialog role, no Esc-to-close, no focus
 * trap, and the dropdown lacked listbox semantics.
 */
const videoData = {
  title: 'Test Track',
  artist: 'Test Artist',
  formats: [{ formatId: '22', quality: '720p', ext: 'mp4', height: 720 }],
  audioFormats: [{ formatId: '140', quality: '130kbps', ext: 'm4a' }],
};

const FOCUSABLE = 'a[href],button,input,[tabindex]:not([tabindex="-1"])';

const renderStandard = (onClose = vi.fn()) => {
  render(
    <MemoryRouter>
      <StandardQualityPicker
        isOpen
        onClose={onClose}
        selectedFormat="mp4"
        videoData={videoData}
        onSelect={vi.fn()}
      />
    </MemoryRouter>
  );
  return onClose;
};

describe('modal accessibility (H8)', () => {
  it('exposes role=dialog with aria-modal', () => {
    renderStandard();
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
  });

  it('closes on Escape', () => {
    const onClose = renderStandard();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('moves focus into the dialog on open', () => {
    renderStandard();
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(
      true
    );
  });

  it('traps Tab within the dialog', () => {
    renderStandard();
    const items = screen
      .getByRole('dialog')
      .querySelectorAll<HTMLElement>(FOCUSABLE);
    items[items.length - 1].focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(items[0]);
  });

  it('exposes the quality dropdown as a listbox', () => {
    renderStandard();
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getAllByRole('option').length).toBeGreaterThan(0);
  });

  it('Spotify picker also exposes role=dialog', () => {
    render(
      <MobileSpotifyPicker
        isOpen
        onClose={vi.fn()}
        videoData={videoData}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
  });
});
