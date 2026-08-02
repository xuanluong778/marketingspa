'use client';

const ACCESS_KEY = 'ms_access_token';

export const authStorage = {
  getAccessToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(ACCESS_KEY);
  },
  setAccessToken(accessToken: string) {
    localStorage.setItem(ACCESS_KEY, accessToken);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    // Legacy cleanup
    localStorage.removeItem('ms_refresh_token');
  },
  isAuthenticated(): boolean {
    return !!this.getAccessToken();
  },
};
