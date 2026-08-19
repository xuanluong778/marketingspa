'use client';

import type { CSSProperties, ReactNode } from 'react';

/**
 * Nút action Auto Post — chữ/icon luôn #FFFFFF full (không dim).
 *
 * Không dùng attribute `disabled` native: Chrome/Safari tự grey chữ
 * trên form control disabled dù CSS color: #fff !important.
 * Dùng aria-disabled + chặn onClick thay thế.
 */
export function AutoPostActionButton({
  tone = 'outline',
  disabled,
  onClick,
  children,
  icon,
}: {
  tone?: 'outline' | 'primary' | 'secondary';
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
  icon?: ReactNode;
}) {
  const isOff = Boolean(disabled);

  const bg: Record<string, string> = {
    outline: isOff ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.22)',
    primary: isOff ? '#059669' : '#10b981',
    secondary: isOff ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.26)',
  };

  const btnStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 36,
    padding: '0 12px',
    borderRadius: 6,
    fontSize: 13,
    flexShrink: 0,
    fontWeight: 800,
    lineHeight: 1.2,
    letterSpacing: '0.01em',
    cursor: isOff ? 'not-allowed' : 'pointer',
    border: '1px solid rgba(255,255,255,0.75)',
    backgroundColor: bg[tone],
    opacity: 1,
    color: '#FFFFFF',
    WebkitTextFillColor: '#FFFFFF',
    /* chặn UA greying / filter */
    filter: 'none',
    WebkitFilter: 'none',
    WebkitAppearance: 'none',
    appearance: 'none',
    colorScheme: 'dark',
  };

  const textStyle: CSSProperties = {
    color: '#FFFFFF',
    WebkitTextFillColor: '#FFFFFF',
    fontWeight: 800,
    opacity: 1,
  };

  return (
    <button
      type="button"
      /* Không set disabled — tránh UA force grey text */
      aria-disabled={isOff}
      data-disabled={isOff ? 'true' : undefined}
      onClick={() => {
        if (isOff) return;
        onClick?.();
      }}
      className="msa-ap-btn"
      style={btnStyle}
    >
      {icon ? (
        <span style={{ display: 'inline-flex', ...textStyle }} aria-hidden>
          {icon}
        </span>
      ) : null}
      <span style={textStyle}>{children}</span>
    </button>
  );
}

export function AutoPostActionIcon({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        width: 16,
        height: 16,
        color: '#FFFFFF',
        WebkitTextFillColor: '#FFFFFF',
        opacity: 1,
      }}
    >
      {children}
    </span>
  );
}
