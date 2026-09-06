export type UiLocale = 'vi' | 'en';

export const UI_LOCALES: readonly UiLocale[] = ['vi', 'en'] as const;

export const DEFAULT_UI_LOCALE: UiLocale = 'vi';

export function isUiLocale(value: unknown): value is UiLocale {
  return value === 'vi' || value === 'en';
}

/** Nested dictionary leaf values are strings; branches are nested records. */
export type Dictionary = { [key: string]: string | Dictionary };

export type TranslateParams = Record<string, string | number>;
