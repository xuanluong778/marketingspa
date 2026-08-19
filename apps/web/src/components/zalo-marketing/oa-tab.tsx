'use client';

import { useState } from 'react';
import { Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { LoadingState, EmptyState, ErrorState } from '@/components/shared/page-state';
import {
  useConnectZaloZbs,
  useStartZaloOAuth,
  useZaloOas,
  useZaloOverview,
} from '@/hooks/use-zalo-marketing';

export function ZaloOaTab() {
  const overview = useZaloOverview();
  const oas = useZaloOas();
  const startOAuth = useStartZaloOAuth();
  const connectZbs = useConnectZaloZbs();
  const [showZbsForm, setShowZbsForm] = useState(false);
  const [zbsForm, setZbsForm] = useState({
    appId: '',
    secretKey: '',
    accessToken: '',
    accountRef: '',
    displayName: '',
    oaConnectionId: '',
  });

  if (oas.isLoading) return <LoadingState label="Đang tải OA..." />;
  if (oas.isError) return <ErrorState message="Không tải được OA" onRetry={() => oas.refetch()} />;

  const oauthReady = overview.data?.oauthConfigured !== false;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
        <div>
          <p className="font-medium">Kết nối Zalo OA (OAuth)</p>
          <p className="text-sm text-muted-foreground">
            Mỗi tổ chức có thể kết nối nhiều OA. Token được mã hóa theo organization + oaId.
          </p>
          {!oauthReady && (
            <p className="mt-1 text-sm text-amber-600">
              Cần cấu hình ENV: ZALO_APP_ID, ZALO_APP_SECRET, ZALO_OAUTH_REDIRECT_URI
            </p>
          )}
        </div>
        <Button
          disabled={!oauthReady || startOAuth.isPending}
          onClick={async () => {
            const res = await startOAuth.mutateAsync({ returnPath: '/zalo-marketing?tab=oa' });
            window.location.href = res.url;
          }}
        >
          <Link2 className="mr-2 h-4 w-4" />
          Kết nối OA
        </Button>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">Danh sách OA / ZBS</h3>
          <Button variant="outline" size="sm" onClick={() => setShowZbsForm((v) => !v)}>
            {showZbsForm ? 'Đóng form ZBS' : 'Thêm kết nối ZBS'}
          </Button>
        </div>

        {showZbsForm && (
          <div className="grid gap-3 rounded-lg border p-4 md:grid-cols-2">
            <div>
              <Label>App ID</Label>
              <Input value={zbsForm.appId} onChange={(e) => setZbsForm({ ...zbsForm, appId: e.target.value })} />
            </div>
            <div>
              <Label>Secret Key</Label>
              <Input value={zbsForm.secretKey} onChange={(e) => setZbsForm({ ...zbsForm, secretKey: e.target.value })} />
            </div>
            <div>
              <Label>Access Token (ZBS)</Label>
              <Input
                value={zbsForm.accessToken}
                onChange={(e) => setZbsForm({ ...zbsForm, accessToken: e.target.value })}
              />
            </div>
            <div>
              <Label>Account Ref / OA ID</Label>
              <Input
                value={zbsForm.accountRef}
                onChange={(e) => setZbsForm({ ...zbsForm, accountRef: e.target.value })}
              />
            </div>
            <div>
              <Label>Tên hiển thị</Label>
              <Input
                value={zbsForm.displayName}
                onChange={(e) => setZbsForm({ ...zbsForm, displayName: e.target.value })}
              />
            </div>
            <div className="md:col-span-2">
              <Button
                disabled={connectZbs.isPending}
                onClick={() =>
                  connectZbs.mutate(zbsForm, {
                    onSuccess: () => {
                      setShowZbsForm(false);
                      setZbsForm({
                        appId: '',
                        secretKey: '',
                        accessToken: '',
                        accountRef: '',
                        displayName: '',
                        oaConnectionId: '',
                      });
                    },
                  })
                }
              >
                Lưu kết nối ZBS
              </Button>
            </div>
          </div>
        )}

        {(oas.data ?? []).length === 0 ? (
          <EmptyState title="Chưa có OA" description="Kết nối OA qua OAuth hoặc thêm ZBS thủ công." />
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="px-3 py-2 text-left">Tên</th>
                  <th className="px-3 py-2 text-left">Loại</th>
                  <th className="px-3 py-2 text-left">OA ID</th>
                  <th className="px-3 py-2 text-left">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {(oas.data ?? []).map((oa) => (
                  <tr key={oa.id} className="border-t">
                    <td className="px-3 py-2 font-medium">{oa.displayName || oa.accountRef}</td>
                    <td className="px-3 py-2">{oa.providerKind === 'ZBS_TEMPLATE' ? 'ZBS' : 'OA'}</td>
                    <td className="px-3 py-2 font-mono text-xs">{oa.accountRef}</td>
                    <td className="px-3 py-2">
                      <Badge variant={oa.status === 'ACTIVE' && !oa.isPaused ? 'default' : 'outline'}>
                        {oa.isPaused ? 'Tạm dừng' : oa.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
