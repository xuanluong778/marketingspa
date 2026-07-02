'use client';

import { useState } from 'react';
import { Plug, Unplug, FlaskConical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { LoadingState, ErrorState } from '@/components/shared/page-state';
import {
  useIntegrations,
  useConnectIntegration,
  useTestIntegration,
  useDisconnectIntegration,
  INTEGRATION_FIELDS,
} from '@/hooks/use-integrations';
import {
  INTEGRATION_STATUS_LABELS,
  type IntegrationItem,
  type IntegrationProvider,
} from '@/types/automation-messaging';
import { cn } from '@/lib/utils';

function statusVariant(status: IntegrationItem['status']): 'default' | 'secondary' | 'outline' {
  if (status === 'CONNECTED') return 'default';
  if (status === 'ERROR') return 'outline';
  return 'secondary';
}

export function IntegrationsPanel() {
  const { data, isLoading, isError, refetch } = useIntegrations();
  const connect = useConnectIntegration();
  const test = useTestIntegration();
  const disconnect = useDisconnectIntegration();
  const [connecting, setConnecting] = useState<IntegrationProvider | null>(null);
  const [credentials, setCredentials] = useState<Record<string, string>>({});

  if (isLoading) return <LoadingState message="Đang tải tích hợp..." />;
  if (isError) return <ErrorState onRetry={refetch} />;

  const items = data ?? [];

  function openConnect(item: IntegrationItem) {
    setConnecting(item.provider);
    const fields = INTEGRATION_FIELDS[item.provider];
    setCredentials(Object.fromEntries(fields.map((f) => [f.key, ''])));
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        {items.map((item) => (
          <Card key={item.provider}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base">{item.label}</CardTitle>
                <Badge
                  variant={statusVariant(item.status)}
                  className={item.status === 'ERROR' ? 'border-destructive text-destructive' : ''}
                >
                  {INTEGRATION_STATUS_LABELS[item.status]}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {item.maskedHint && (
                <p className="text-xs text-muted-foreground">Tài khoản: {item.maskedHint}</p>
              )}
              <p className="text-xs text-muted-foreground">
                MVP placeholder — chưa kết nối API thật. Credentials được mã hóa trên server.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => openConnect(item)}>
                  <Plug className="h-3.5 w-3.5 mr-1" />
                  Cấu hình
                </Button>
                {item.status === 'CONNECTED' && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={test.isPending}
                      onClick={() => test.mutate(item.provider)}
                    >
                      <FlaskConical className="h-3.5 w-3.5 mr-1" />
                      Test
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      disabled={disconnect.isPending}
                      onClick={() => disconnect.mutate(item.provider)}
                    >
                      <Unplug className="h-3.5 w-3.5 mr-1" />
                      Ngắt
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!connecting} onOpenChange={(o) => !o && setConnecting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Cấu hình {items.find((i) => i.provider === connecting)?.label}
            </DialogTitle>
          </DialogHeader>
          {connecting && (
            <div className="space-y-3">
              {INTEGRATION_FIELDS[connecting].map((field) => (
                <div key={field.key} className="space-y-1">
                  <Label>{field.label}</Label>
                  <Input
                    type={field.type ?? 'text'}
                    value={credentials[field.key] ?? ''}
                    onChange={(e) => setCredentials((c) => ({ ...c, [field.key]: e.target.value }))}
                    placeholder="Nhập để test mock connect..."
                  />
                </div>
              ))}
              <p className={cn('text-xs text-muted-foreground')}>
                API key sẽ được mã hóa bằng ENCRYPTION_KEY trước khi lưu DB.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConnecting(null)}>
              Hủy
            </Button>
            <Button
              disabled={!connecting || connect.isPending}
              onClick={() => {
                if (!connecting) return;
                connect.mutate(
                  { provider: connecting, credentials },
                  { onSuccess: () => setConnecting(null) },
                );
              }}
            >
              {connect.isPending ? 'Đang lưu...' : 'Lưu (mock connect)'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
