'use client';

import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingState, EmptyState, ErrorState } from '@/components/shared/page-state';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useMemo, useState } from 'react';
import { useSyncZaloTemplates, useZaloOas, useZaloTemplates } from '@/hooks/use-zalo-marketing';
import { useT } from '@/i18n/i18n-provider';

export function ZaloTemplatesTab() {
  const t = useT();
  const oas = useZaloOas();
  const zbsConnections = useMemo(
    () => (oas.data ?? []).filter((c) => c.providerKind === 'ZBS_TEMPLATE'),
    [oas.data],
  );
  const [connectionId, setConnectionId] = useState('');
  const activeConnection = connectionId || zbsConnections[0]?.id || '';
  const templates = useZaloTemplates(activeConnection || undefined);
  const sync = useSyncZaloTemplates();

  if (oas.isLoading) return <LoadingState label={t('zalo.loadingZbs')} />;
  if (oas.isError) return <ErrorState message={t('zalo.loadConnectionsFailed')} onRetry={() => oas.refetch()} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] space-y-1">
          <p className="text-sm font-medium">{t('zalo.zbsConnection')}</p>
          <Select value={activeConnection} onValueChange={setConnectionId}>
            <SelectTrigger>
              <SelectValue placeholder={t('zalo.selectZbs')} />
            </SelectTrigger>
            <SelectContent>
              {zbsConnections.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.displayName || c.accountRef}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="outline"
          disabled={!activeConnection || sync.isPending}
          onClick={() => sync.mutate(activeConnection)}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Sync Zalo
        </Button>
      </div>

      {zbsConnections.length === 0 ? (
        <EmptyState
          title={t('zalo.emptyZbs')}
          description={t('zalo.connectZbsFirst')}
        />
      ) : templates.isLoading ? (
        <LoadingState label={t('zalo.loadingTemplates')} />
      ) : (templates.data ?? []).length === 0 ? (
        <EmptyState title={t('zalo.emptyTemplates')} description={t('zalo.syncHint')} />
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-3 py-2 text-left">{t('zalo.name')}</th>
                <th className="px-3 py-2 text-left">{t('zalo.zaloCode')}</th>
                <th className="px-3 py-2 text-left">{t('zalo.status')}</th>
                <th className="px-3 py-2 text-left">{t('zalo.variables')}</th>
              </tr>
            </thead>
            <tbody>
              {(templates.data ?? []).map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="px-3 py-2 font-medium">{row.name}</td>
                  <td className="px-3 py-2 font-mono text-xs">{row.providerTemplateId}</td>
                  <td className="px-3 py-2">
                    <Badge variant={row.approvalStatus === 'APPROVED' ? 'default' : 'outline'}>
                      {row.approvalStatus}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {Array.isArray(row.variables) ? row.variables.join(', ') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
