import { en } from './dictionaries/en';
import { vi } from './dictionaries/vi';
import {
  DEFAULT_UI_LOCALE,
  type Dictionary,
  type TranslateParams,
  type UiLocale,
} from './types';

export type { Dictionary, TranslateParams, UiLocale } from './types';
export { DEFAULT_UI_LOCALE, UI_LOCALES, isUiLocale } from './types';

export const dictionaries: Record<UiLocale, Dictionary> = {
  vi,
  en,
};

function lookup(dict: Dictionary, path: string[]): string | undefined {
  let current: string | Dictionary | undefined = dict;
  for (const segment of path) {
    if (current == null || typeof current === 'string') return undefined;
    current = current[segment];
  }
  return typeof current === 'string' ? current : undefined;
}

function interpolate(template: string, params?: TranslateParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = params[key];
    return value == null ? `{${key}}` : String(value);
  });
}

/**
 * Resolve a dot-path key for the given locale.
 * Fallback chain: requested locale → vi (always) → key string.
 * When locale is `en`, missing keys fall back to `vi` then the key.
 */
export function translate(
  locale: UiLocale,
  key: string,
  params?: TranslateParams,
): string {
  const path = key.split('.').filter(Boolean);
  if (path.length === 0) return key;

  const primary = lookup(dictionaries[locale] ?? dictionaries[DEFAULT_UI_LOCALE], path);
  if (primary != null) return interpolate(primary, params);

  if (locale !== 'vi') {
    const fallbackVi = lookup(dictionaries.vi, path);
    if (fallbackVi != null) return interpolate(fallbackVi, params);
  }

  return key;
}
