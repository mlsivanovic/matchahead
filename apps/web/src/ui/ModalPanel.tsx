import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const focusable = 'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';
let openPanels = 0;
let originalOverflow = '';
let background: HTMLElement | null = null;
let originalInert = false;
const dismissedMarkers = new Set<string>();

function consumeDismissedHistory() {
  const marker = history.state?.matchaheadPanel;
  if (!dismissedMarkers.delete(marker)) return;
  // Multiple nested panels can disappear together on sign-out. Consume
  // their entries one at a time after each asynchronous history traversal.
  window.addEventListener('popstate', consumeDismissedHistory, { once: true });
  history.back();
}

/** Each panel owns one history entry. Nested panels close in reverse order. */
export function ModalPanel(props: { title: string; onClose: () => void; children: ReactNode; className?: string }) {
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  const onClose = useRef(props.onClose);
  onClose.current = props.onClose;
  const close = useRef<() => void>(() => {});
  const lifecycle = useRef(0);
  const origin = useRef<{ state: unknown; focus: HTMLElement | null } | null>(null);

  useEffect(() => {
    const generation = ++lifecycle.current;
    if (!origin.current) origin.current = { state: history.state, focus: document.activeElement instanceof HTMLElement ? document.activeElement : null };
    const previousFocus = origin.current.focus;
    const marker = `matchahead-panel-${id}`;
    if (history.state?.matchaheadPanel !== marker) history.pushState({ ...history.state, matchaheadPanel: marker }, '', location.href);
    if (openPanels++ === 0) {
      originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      background = document.getElementById('root');
      originalInert = background?.inert ?? false;
      if (background) background.inert = true;
    }
    const covered = [...document.querySelectorAll<HTMLElement>('[data-modal-panel]')]
      .filter(node => node !== panel.current)
      .map(node => ({ node, inert: node.inert, hidden: node.getAttribute('aria-hidden') }));
    for (const { node } of covered) { node.inert = true; node.setAttribute('aria-hidden', 'true'); }
    let traversed = false;
    let closing = false;
    const isTop = () => [...document.querySelectorAll('[data-modal-panel]')].at(-1) === panel.current;
    close.current = () => {
      if (closing || !isTop()) return;
      closing = true;
      if (history.state?.matchaheadPanel === marker) history.back();
      else { traversed = true; onClose.current(); }
    };
    const onPop = () => {
      if (history.state?.matchaheadPanel !== marker && isTop()) {
        traversed = true;
        onClose.current();
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (!isTop()) return;
      if (event.key === 'Escape') { event.preventDefault(); close.current(); }
      if (event.key !== 'Tab') return;
      const nodes = [...(panel.current?.querySelectorAll<HTMLElement>(focusable) ?? [])].filter(node => node.getClientRects().length);
      const first = nodes[0];
      const last = nodes.at(-1);
      if (!first || !last) { event.preventDefault(); panel.current?.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) { event.preventDefault(); first.focus(); }
    };
    const onFocus = (event: FocusEvent) => {
      if (isTop() && !panel.current?.contains(event.target as Node)) panel.current?.focus();
    };
    const viewport = window.visualViewport;
    const onViewport = () => {
      const backdrop = panel.current?.parentElement;
      if (!backdrop || !viewport) return;
      const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      backdrop.style.bottom = `${inset}px`;
      panel.current?.style.setProperty('--panel-viewport-height', `${viewport.height}px`);
    };
    window.addEventListener('popstate', onPop);
    document.addEventListener('keydown', onKey);
    document.addEventListener('focusin', onFocus);
    viewport?.addEventListener('resize', onViewport);
    viewport?.addEventListener('scroll', onViewport);
    onViewport();
    panel.current?.focus();
    return () => {
      window.removeEventListener('popstate', onPop);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('focusin', onFocus);
      viewport?.removeEventListener('resize', onViewport);
      viewport?.removeEventListener('scroll', onViewport);
      for (const { node, inert, hidden } of covered) {
        node.inert = inert;
        if (hidden === null) node.removeAttribute('aria-hidden');
        else node.setAttribute('aria-hidden', hidden);
      }
      // StrictMode's immediate remount reuses the same entry. A genuine
      // programmatic dismissal consumes it, just like Back or Escape.
      queueMicrotask(() => {
        if (lifecycle.current === generation && !traversed) {
          dismissedMarkers.add(marker);
          consumeDismissedHistory();
        }
      });
      if (--openPanels === 0) {
        document.body.style.overflow = originalOverflow;
        if (background) background.inert = originalInert;
        background = null;
      }
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [id]);

  return createPortal(<div className="modal-backdrop" onClick={event => { if (event.target === event.currentTarget) close.current(); }}>
    <div ref={panel} data-modal-panel="true" className={`modal-panel ${props.className ?? ''}`} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} tabIndex={-1}>
      <header className="modal-header"><h2 id={`${id}-title`}>{props.title}</h2><button type="button" aria-label={`Zatvori: ${props.title}`} onClick={() => close.current()}>✕</button></header>
      <div className="modal-content">{props.children}</div>
    </div>
  </div>, document.body);
}
