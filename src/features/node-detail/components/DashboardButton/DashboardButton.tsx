import { useCallback, useEffect, useRef, useState, type JSX } from 'react';
import { createPortal } from 'react-dom';

import type { DashboardButtonProps } from './DashboardButton.types';

const TRIGGER_CLASS = 'rounded border border-medium px-2 py-0.5 text-sm text-primary';
const MENU_GAP_PX = 4;

export function DashboardButton({ state }: Readonly<DashboardButtonProps>): JSX.Element | null {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  // The menu is portaled to document.body, so it must position ITSELF: without fixed
  // coordinates it lays out in normal flow after #root (which is height:100%), i.e. below
  // the viewport — the button looks like it does nothing when clicked.
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);

  const placeMenu = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect !== undefined) {
      setAnchor({ top: rect.bottom + MENU_GAP_PX, left: rect.left });
    }
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (evt: MouseEvent): void => {
      const target = evt.target as Node | null;
      if (
        target !== null &&
        (menuRef.current?.contains(target) === true || triggerRef.current?.contains(target) === true)
      ) {
        return;
      }
      setOpen(false);
    };
    const onKeyDown = (evt: KeyboardEvent): void => {
      if (evt.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', placeMenu);
    window.addEventListener('scroll', placeMenu, true);
    return (): void => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', placeMenu);
      window.removeEventListener('scroll', placeMenu, true);
    };
  }, [open, placeMenu]);

  if (state.status !== 'ready') {
    return null;
  }
  const { urls } = state;
  if (urls.length <= 1) {
    const only = urls[0];
    if (only === undefined) {
      return null;
    }
    return (
      <a
        href={only.url}
        target="_blank"
        rel="noopener noreferrer"
        title="Open node dashboard"
        data-testid="node-detail-dashboard-button"
        className={TRIGGER_CLASS}
      >
        Dashboard
      </a>
    );
  }
  return (
    <div data-testid="node-detail-dashboards-menu" onMouseDown={(event): void => event.stopPropagation()}>
      <button
        ref={triggerRef}
        type="button"
        className={TRIGGER_CLASS}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Dashboards"
        onClick={() => {
          placeMenu();
          setOpen((v) => !v);
        }}
      >
        Dashboards
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            className="fixed z-[1200] min-w-[8rem] rounded border border-weak bg-surface p-1 shadow"
            style={{ top: anchor?.top ?? 0, left: anchor?.left ?? 0 }}
          >
            {urls.map((link, index) => (
              <a
                key={`${link.url}-${index}`}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                role="menuitem"
                data-testid={`node-detail-dashboard-link-${index}`}
                className="block cursor-pointer rounded px-2 py-1 text-sm text-primary outline-none hover:bg-[var(--ksg-border-weak)]"
              >
                {link.label ?? link.url}
              </a>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}
