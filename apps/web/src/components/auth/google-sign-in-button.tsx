'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const GIS_SCRIPT_ID = 'google-gsi-client';
const GIS_SRC = 'https://accounts.google.com/gsi/client';

type CredentialResponse = {
  credential?: string;
  select_by?: string;
};

type Props = {
  disabled?: boolean;
  label?: string;
  onCredential: (idToken: string) => void;
};

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: Record<string, unknown>) => void;
          renderButton: (parent: HTMLElement, config: Record<string, unknown>) => void;
          cancel: () => void;
        };
      };
    };
  }
}

function loadGsiScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.google?.accounts?.id) return Promise.resolve();

  const existing = document.getElementById(GIS_SCRIPT_ID) as HTMLScriptElement | null;
  if (existing) {
    return new Promise((resolve, reject) => {
      if (window.google?.accounts?.id) {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Không tải được Google Sign-In')), {
        once: true,
      });
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.id = GIS_SCRIPT_ID;
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Không tải được Google Sign-In'));
    document.head.appendChild(script);
  });
}

/**
 * Google Identity Services — lấy ID token rồi gửi về POST /auth/google.
 * Login/Register dùng prop onCredential(idToken).
 */
export function GoogleSignInButton({
  disabled,
  label = 'Tiếp tục với Google',
  onCredential,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onCredentialRef = useRef(onCredential);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  onCredentialRef.current = onCredential;

  const clientId = (process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '').trim();

  const handleCredential = useCallback((response: CredentialResponse) => {
    const idToken = response?.credential?.trim();
    if (!idToken) {
      setError('Google không trả về token. Thử lại.');
      return;
    }
    setError(null);
    onCredentialRef.current(idToken);
  }, []);

  useEffect(() => {
    if (!clientId) {
      setError('Chưa cấu hình NEXT_PUBLIC_GOOGLE_CLIENT_ID');
      return;
    }
    if (disabled) return;

    let cancelled = false;

    (async () => {
      try {
        await loadGsiScript();
        if (cancelled || !hostRef.current || !window.google?.accounts?.id) return;

        hostRef.current.innerHTML = '';

        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: handleCredential,
          auto_select: false,
          cancel_on_tap_outside: true,
          context: 'signin',
          ux_mode: 'popup',
        });

        const width = Math.max(hostRef.current.offsetWidth || 320, 240);

        window.google.accounts.id.renderButton(hostRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'rectangular',
          logo_alignment: 'left',
          width,
          locale: 'vi',
        });

        // Ensure accessible label for screen readers / tests
        const btn = hostRef.current.querySelector('div[role="button"]') as HTMLElement | null;
        if (btn && label) {
          btn.setAttribute('aria-label', label);
        }

        if (!cancelled) {
          setReady(true);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Không khởi tạo được Google Sign-In');
        }
      }
    })();

    return () => {
      cancelled = true;
      try {
        window.google?.accounts?.id?.cancel?.();
      } catch {
        /* ignore */
      }
    };
  }, [clientId, disabled, handleCredential, label]);

  return (
    <div className="relative w-full space-y-2">
      <div
        ref={hostRef}
        className="flex w-full min-h-[40px] items-center justify-center overflow-hidden rounded-md [&iframe]:!w-full"
        data-google-signin={ready ? 'ready' : 'loading'}
        aria-busy={!ready && !error}
      />
      {disabled && (
        <div
          className="absolute inset-0 z-10 cursor-not-allowed rounded-md bg-background/40"
          aria-hidden
        />
      )}
      {!ready && !error && (
        <button
          type="button"
          disabled
          className="pointer-events-none absolute inset-0 flex w-full items-center justify-center rounded-md border border-border bg-transparent px-4 py-2 text-sm text-muted-foreground"
        >
          {label}…
        </button>
      )}
      {error && (
        <p className="text-center text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export default GoogleSignInButton;
