import { useEffect, RefObject } from 'react';

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),textarea,select,[tabindex]:not([tabindex="-1"])';

// keyboard/SR access for portal modals
export const useModalA11y = (
  isOpen: boolean,
  onClose: () => void,
  containerRef: RefObject<HTMLElement | null>
) => {
  useEffect(() => {
    if (!isOpen) return undefined;
    const container = containerRef.current;
    // remember trigger to restore focus later
    const previous = document.activeElement as HTMLElement | null;

    const focusables = () =>
      Array.from(container?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);

    // pull focus inside so SR/keyboard land here
    (focusables()[0] ?? container)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') return onClose();
      if (event.key !== 'Tab') return undefined;
      const items = focusables();
      if (items.length === 0) return undefined;
      const first = items[0];
      const last = items[items.length - 1];
      // wrap focus so Tab stays trapped
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
      return undefined;
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previous?.focus();
    };
  }, [isOpen, onClose, containerRef]);
};
