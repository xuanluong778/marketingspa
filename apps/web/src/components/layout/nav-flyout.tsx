'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { NavGroup, NavItem } from '@/config/navigation';

const CLOSE_DELAY_MS = 220;

function canHover(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}

interface NavFlyoutProps {
  group: NavGroup;
  active: boolean;
  isItemActive: (item: NavItem) => boolean;
  onNavigate?: () => void;
}

export function NavFlyout({ group, active, isItemActive, onNavigate }: NavFlyoutProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearCloseTimer = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const openMenu = useCallback(() => {
    clearCloseTimer();
    setOpen(true);
  }, [clearCloseTimer]);

  const scheduleClose = useCallback(() => {
    clearCloseTimer();
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  }, [clearCloseTimer]);

  const closeNow = useCallback(() => {
    clearCloseTimer();
    setOpen(false);
  }, [clearCloseTimer]);

  useEffect(() => () => clearCloseTimer(), [clearCloseTimer]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeNow();
    };
    const onPointer = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node | null;
      if (rootRef.current && target && !rootRef.current.contains(target)) {
        closeNow();
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('touchstart', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('touchstart', onPointer);
    };
  }, [open, closeNow]);

  const items = group.items ?? [];

  return (
    <div
      ref={rootRef}
      className="relative"
      onMouseEnter={() => {
        if (canHover()) openMenu();
      }}
      onMouseLeave={() => {
        if (canHover()) scheduleClose();
      }}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors touch-manipulation',
          active || open
            ? 'bg-white text-[#0A3D30] shadow-sm'
            : 'text-white/70 hover:bg-white/10 hover:text-white',
        )}
      >
        <group.icon className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{group.title}</span>
        <ChevronRight
          className={cn('h-4 w-4 shrink-0 transition-transform', open ? 'rotate-90' : '')}
        />
      </button>

      {open ? (
        <div
          role="menu"
          className={cn(
            'z-50 min-w-[220px] rounded-lg border border-white/15 bg-[#0A3D30] p-1.5 shadow-xl',
            'absolute left-full top-0 ml-1.5 hidden md:block',
            'max-md:static max-md:mt-1 max-md:ml-0 max-md:block max-md:w-full',
          )}
          onMouseEnter={() => {
            if (canHover()) openMenu();
          }}
          onMouseLeave={() => {
            if (canHover()) scheduleClose();
          }}
        >
          {items.map((item) => {
            const itemActive = isItemActive(item);
            return (
              <Link
                key={item.href}
                role="menuitem"
                href={item.href}
                onClick={() => {
                  closeNow();
                  onNavigate?.();
                }}
                className={cn(
                  'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors touch-manipulation',
                  itemActive
                    ? 'bg-white text-[#0A3D30] shadow-sm'
                    : 'text-white/75 hover:bg-white/10 hover:text-white',
                )}
              >
                <item.icon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{item.title}</span>
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
