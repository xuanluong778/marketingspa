'use client';

import { Check, Languages } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useI18n, useT } from '@/i18n/i18n-provider';
import type { UiLocale } from '@/i18n/types';

const OPTIONS: { value: UiLocale; labelKey: string; hintKey: string }[] = [
  {
    value: 'vi',
    labelKey: 'settings.system.languageVi',
    hintKey: 'settings.language.hintVi',
  },
  {
    value: 'en',
    labelKey: 'settings.system.languageEn',
    hintKey: 'settings.language.hintEn',
  },
];

export function SettingsLanguagePanel() {
  const t = useT();
  const { locale, setLocale } = useI18n();

  return (
    <div className="grid max-w-4xl gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Languages className="h-4 w-4" />
            {t('settings.language.title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{t('settings.language.description')}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {OPTIONS.map((opt) => {
              const active = locale === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setLocale(opt.value)}
                  className={cn(
                    'flex items-start gap-3 rounded-lg border p-4 text-left transition-colors',
                    active
                      ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                      : 'border-border hover:bg-muted/50',
                  )}
                >
                  <span
                    className={cn(
                      'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                      active ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40',
                    )}
                  >
                    {active ? <Check className="h-3 w-3" /> : null}
                  </span>
                  <span>
                    <span className="block text-sm font-medium">{t(opt.labelKey)}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{t(opt.hintKey)}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">{t('settings.language.persistHint')}</p>
        </CardContent>
      </Card>
    </div>
  );
}
