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
import { apiClient } from '@/lib/api-client';

export function SettingsSystemPanel() {
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
      setMsg('Đã lưu cài đặt hệ thống.');
    },
    onError: (e) => {
      setMsg(e instanceof Error ? e.message : 'Lưu thất bại (kiểm tra quyền Owner/Admin).');
    },
  });

  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState onRetry={refetch} />;

  return (
    <div className="grid gap-6 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Doanh nghiệp</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="space-y-1">
            <Label>Tên doanh nghiệp</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!canWrite} />
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Slug</span>
            <span className="font-medium">{org?.slug ?? '—'}</span>
          </div>
          <Separator />
          <div className="space-y-1">
            <Label>Điện thoại</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} disabled={!canWrite} />
          </div>
          <div className="space-y-1">
            <Label>Email liên hệ</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} disabled={!canWrite} />
          </div>
          <div className="space-y-1">
            <Label>Địa chỉ</Label>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              disabled={!canWrite}
            />
          </div>
          {!canWrite && (
            <p className="text-xs text-muted-foreground">
              Chỉ Owner/Admin (quyền <code>settings.manage</code>) được sửa.
            </p>
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
              {update.isPending ? 'Đang lưu…' : 'Lưu'}
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Múi giờ, ngôn ngữ & thông báo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Múi giờ thiết bị</span>
            <span className="font-medium">{deviceTz}</span>
          </div>
          <Separator />
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Ngôn ngữ UI</span>
            <span className="font-medium">Tiếng Việt</span>
          </div>
          <Separator />
          <p className="text-muted-foreground text-xs">
            Logo upload / preference org-level timezone & notification hub sẽ gắn schema khi có API
            riêng — hiện không hard-code giả. Thông báo hệ thống dùng kênh email đã verify và gói
            active.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lưu trữ dữ liệu (organization)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Khách hàng</span>
            <span className="font-medium">{org?._count?.customers ?? '—'}</span>
          </div>
          <Separator />
          <div className="flex justify-between">
            <span className="text-muted-foreground">Lead</span>
            <span className="font-medium">{org?._count?.leads ?? '—'}</span>
          </div>
          <Separator />
          <div className="flex justify-between">
            <span className="text-muted-foreground">Nhân viên</span>
            <span className="font-medium">{org?._count?.employees ?? '—'}</span>
          </div>
          <Separator />
          <div className="flex justify-between">
            <span className="text-muted-foreground">Lịch hẹn</span>
            <span className="font-medium">{org?._count?.appointments ?? '—'}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Audit log</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            Nhật ký HRM: endpoint <code>/api/v1/hrm/audit</code> (quyền <code>hrm.audit.read</code>
            ). Audit nền tảng: khu vực Admin (SUPER_ADMIN).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
