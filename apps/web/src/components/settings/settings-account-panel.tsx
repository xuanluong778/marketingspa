'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadingState, ErrorState } from '@/components/shared/page-state';
import { useCurrentUser, useChangePassword, useLogoutAll, hasPermission } from '@/hooks/use-auth';
import { useCurrentSubscription } from '@/hooks/use-billing';
import { useOrganization } from '@/hooks/use-queries';
import { formatDateTime } from '@/lib/format';

export function SettingsAccountPanel() {
  const {
    data: user,
    isLoading: userLoading,
    isError: userError,
    refetch: refetchUser,
  } = useCurrentUser();
  const { data: org } = useOrganization();
  const sub = useCurrentSubscription();
  const changePassword = useChangePassword();
  const logoutAll = useLogoutAll();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwdMsg, setPwdMsg] = useState<string | null>(null);

  if (userLoading) return <LoadingState />;
  if (userError) return <ErrorState onRetry={refetchUser} />;

  const subscription = sub.data;
  const remaining = subscription?.remainingDays ?? subscription?.daysRemaining ?? null;

  return (
    <div className="grid gap-6 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tài khoản</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Row label="Họ tên" value={user?.name} />
          <Separator />
          <Row label="Email" value={user?.email} />
          <Separator />
          <Row label="Organization" value={user?.organization?.name ?? org?.name} />
          <Separator />
          <Row label="Vai trò" value={user?.roleName ?? user?.role} />
          <Separator />
          <Row
            label="Email xác minh"
            value={user?.emailVerified === false ? 'Chưa xác minh' : 'Đã xác minh / không bắt buộc'}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Gói & quota</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {sub.isLoading && <p className="text-muted-foreground">Đang tải subscription…</p>}
          {sub.isError && (
            <p className="text-destructive text-sm">Không tải được gói. Thử lại sau.</p>
          )}
          {subscription && (
            <>
              <Row
                label="Gói hiện tại"
                value={
                  subscription.planName ||
                  subscription.plan?.name ||
                  subscription.planCode ||
                  (subscription.hasPlan ? 'Đang có gói' : 'Chưa có gói')
                }
              />
              <Separator />
              <Row label="Trạng thái" value={subscription.status || '—'} />
              <Separator />
              <Row
                label="Ngày hết hạn"
                value={
                  subscription.expiresAt
                    ? formatDateTime(subscription.expiresAt)
                    : subscription.currentPeriodEnd
                      ? formatDateTime(subscription.currentPeriodEnd)
                      : '—'
                }
              />
              <Separator />
              <Row
                label="Số ngày còn lại"
                value={remaining != null ? `${remaining} ngày` : subscription.isExpired ? '0' : '—'}
              />
              {subscription.trial?.activated ? (
                <>
                  <Separator />
                  <Row
                    label="Trial"
                    value={`Còn ${subscription.trial.remainingDays} ngày (hết ${
                      subscription.trial.trialEndsAt
                        ? formatDateTime(subscription.trial.trialEndsAt)
                        : '—'
                    })`}
                  />
                </>
              ) : null}
              <div className="pt-2">
                <Button asChild size="sm" variant="outline">
                  <Link href="/pricing">Xem / nâng cấp gói</Link>
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Đổi mật khẩu</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 max-w-md">
          <div className="space-y-1">
            <Label htmlFor="cur-pwd">Mật khẩu hiện tại</Label>
            <Input
              id="cur-pwd"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="new-pwd">Mật khẩu mới</Label>
            <Input
              id="new-pwd"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          {pwdMsg && <p className="text-sm text-muted-foreground">{pwdMsg}</p>}
          <Button
            size="sm"
            disabled={!currentPassword || newPassword.length < 8 || changePassword.isPending}
            onClick={() => {
              setPwdMsg(null);
              changePassword.mutate(
                { currentPassword, newPassword },
                {
                  onSuccess: () => {
                    setCurrentPassword('');
                    setNewPassword('');
                    setPwdMsg('Đã đổi mật khẩu thành công.');
                  },
                  onError: (err) => {
                    setPwdMsg(err instanceof Error ? err.message : 'Đổi mật khẩu thất bại');
                  },
                },
              );
            }}
          >
            {changePassword.isPending ? 'Đang lưu…' : 'Đổi mật khẩu'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Bảo mật & phiên đăng nhập</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Đăng xuất tất cả thiết bị sẽ thu hồi refresh/session trên server. Không lưu mật khẩu hay
            API key trên trình duyệt.
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={logoutAll.isPending}
            onClick={() => {
              logoutAll.mutate(undefined, {
                onSuccess: () => {
                  if (typeof window !== 'undefined') window.location.replace('/login');
                },
              });
            }}
          >
            {logoutAll.isPending ? 'Đang đăng xuất…' : 'Đăng xuất tất cả phiên'}
          </Button>
          {hasPermission(user, 'settings.manage') ? (
            <p className="text-xs text-muted-foreground">Bạn có quyền quản trị cài đặt tổ chức.</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="font-medium text-right break-all">{value || '—'}</span>
    </div>
  );
}
