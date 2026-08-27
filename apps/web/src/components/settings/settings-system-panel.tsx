'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadingState, ErrorState } from '@/components/shared/page-state';
import { useOrganization } from '@/hooks/use-queries';
import { useCurrentUser, hasPermission } from '@/hooks/use-auth';
import { useT } from '@/i18n/i18n-provider';
import { apiClient } from '@/lib/api-client';
import { SettingsLanguagePanel } from '@/components/settings/settings-language-panel';

export function SettingsSystemPanel() {
  const t = useT();
  const qc = useQueryClient();
  const { data: org, isLoading, isError, refetch } = useOrganization();
  const { data: user } = useCurrentUser();
  const canWrite =
    hasPermission(user, 'settings.manage') ||
    user?.role === 'OWNER' ||
    user?.role === 'SUPER_ADMIN';

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const deviceTz =
    typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : '—';

  useEffect(() => {
    if (!org) return;
    setName(org.name || '');
    setPhone(org.phone || '');
    setEmail(org.email || '');
    setAddress(org.address || '');
  }, [org]);

  const update = useMutation({
    mutationFn: (body: { name?: string; phone?: string; email?: string; address?: string }) =>
      apiClient('/organizations/current', {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['organization'] });
      setMsg(t('settings.system.saveSuccess'));
    },
    onError: (e) => {
      setMsg(e instanceof Error ? e.message : t('settings.system.saveFailed'));
    },
  });

  if (isLoading) {
    return (
      <div className="grid max-w-4xl gap-6">
        <SettingsLanguagePanel />
        <LoadingState />
      </div>
    );
  }
  if (isError) {
    return (
      <div className="grid max-w-4xl gap-6">
        <SettingsLanguagePanel />
        <ErrorState onRetry={refetch} />
      </div>
    );
  }

  return (
    <div className="grid gap-6 max-w-4xl">
      <SettingsLanguagePanel />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('settings.system.business')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="space-y-1">
            <Label>{t('settings.system.businessName')}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!canWrite} />
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">{t('settings.system.slug')}</span>
            <span className="font-medium">{org?.slug ?? '—'}</span>
          </div>
          <Separator />
          <div className="space-y-1">
            <Label>{t('settings.system.contactPhone')}</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} disabled={!canWrite} />
          </div>
          <div className="space-y-1">
            <Label>{t('settings.system.contactEmail')}</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} disabled={!canWrite} />
          </div>
          <div className="space-y-1">
            <Label>{t('settings.system.address')}</Label>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              disabled={!canWrite}
            />
          </div>
          {!canWrite && (
            <p className="text-xs text-muted-foreground">{t('settings.system.writeHint')}</p>
          )}
          {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
          {canWrite && (
            <Button
              size="sm"
              disabled={update.isPending || !name.trim()}
              onClick={() =>
                update.mutate({
                  name: name.trim(),
                  phone: phone.trim() || undefined,
                  email: email.trim() || undefined,
                  address: address.trim() || undefined,
                })
              }
            >
              {update.isPending ? t('common.saving') : t('common.save')}
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('settings.system.timezoneLanguage')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">{t('settings.system.deviceTimezone')}</span>
            <span className="font-medium">{deviceTz}</span>
          </div>
          <Separator />
          <p className="text-muted-foreground text-xs">{t('settings.system.prefsHint')}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('settings.system.dataStorage')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('settings.system.customersCount')}</span>
            <span className="font-medium">{org?._count?.customers ?? '—'}</span>
          </div>
          <Separator />
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('settings.system.leadsCount')}</span>
            <span className="font-medium">{org?._count?.leads ?? '—'}</span>
          </div>
          <Separator />
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('settings.system.employeesCount')}</span>
            <span className="font-medium">{org?._count?.employees ?? '—'}</span>
          </div>
          <Separator />
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('settings.system.appointmentsCount')}</span>
            <span className="font-medium">{org?._count?.appointments ?? '—'}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('settings.system.auditLog')}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>{t('settings.system.auditLogHint')}</p>
        </CardContent>
      </Card>
    </div>
  );
}
