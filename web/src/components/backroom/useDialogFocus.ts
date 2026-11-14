import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement);
}

/**
 * Modal focus contract for the back room: focus moves inside on open, Tab stays inside, Escape closes,
 * and focus goes back to whatever opened it (or the buyer's poster if that button is gone) on close.
 */
export function useDialogFocus(ref: RefObject<HTMLElement | null>, onClose: () => void) {
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const poster = opener?.closest<HTMLElement>('[data-buyer], .buyer, .poster-hit, article, li') ?? null;
    const root = ref.current;
    if (root) {
      const first = root.querySelector<HTMLElement>('[data-autofocus]') ?? focusables(root)[0];
      first?.focus({ preventScroll: true });
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close.current();
        return;
      }
      if (e.key !== 'Tab' || !root) return;
      const list = focusables(root);
      if (!list.length) return;
      const at = list.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && at <= 0) {
        e.preventDefault();
        list[list.length - 1].focus();
      } else if (!e.shiftKey && (at === -1 || at === list.length - 1)) {
        e.preventDefault();
        list[0].focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      if (opener?.isConnected) {
        opener.focus({ preventScroll: true });
        return;
      }
      if (!poster?.isConnected) return;
      const inner = poster.querySelector<HTMLElement>(FOCUSABLE);
      if (inner) inner.focus({ preventScroll: true });
      else {
        poster.setAttribute('tabindex', '-1');
        poster.focus({ preventScroll: true });
      }
    };
  }, [ref]);
}
