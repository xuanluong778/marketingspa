'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ErrorState, LoadingState } from '@/components/shared/page-state';
import { formatDateTime } from '@/lib/format';
import {
  useAdminForceLogout,
  useAdminSoftDeleteUser,
  useAdminUsers,
  useAdminUserStatus,
} from '@/hooks/use-platform-admin';

export default function AdminUsersPage() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const list = useAdminUsers({ q, status, page, pageSize: 20 });
  const statusMut = useAdminUserStatus();
  const logoutMut = useAdminForceLogout();
  const deleteMut = useAdminSoftDeleteUser();

  function lockToggle(id: string, email: string, nextActive: boolean) {
    const reason = window.prompt(
      `${nextActive ? 'Mở khóa' : 'Khóa'} user ${email}.\nLý do (tối thiểu 3 ký tự):`,
    );
    if (!reason || reason.trim().length < 3) return;
    if (
      !window.confirm(
        `Xác nhận ${nextActive ? 'MỞ KHÓA' : 'KHÓA'}?\nEmail: ${email}\nUser bị khóa sẽ bị đăng xuất ngay và không gọi được API.`,
      )
    ) {
      return;
    }
    statusMut.mutate(
      { id, isActive: nextActive, reason: reason.trim() },
      {
        onSuccess: () => window.alert(nextActive ? 'Đã mở khóa' : 'Đã khóa và thu hồi session'),
        onError: (e) => window.alert(e instanceof Error ? e.message : 'Lỗi'),
      },
    );
  }

  function forceLogout(id: string, email: string) {
    const reason = window.prompt(`Buộc đăng xuất ${email}.\nLý do:`);
    if (!reason || reason.trim().length < 3) return;
    if (!window.confirm(`Thu hồi toàn bộ session của ${email}?`)) return;
    logoutMut.mutate(
      { id, reason: reason.trim() },
      {
        onSuccess: (r) =>
          window.alert(
            `Đã revoke ${(r as { revokedSessions?: number }).revokedSessions ?? 0} session`,
          ),
        onError: (e) => window.alert(e instanceof Error ? e.message : 'Lỗi'),
      },
    );
  }

  function softDelete(id: string, email: string) {
    if (
      !window.confirm(
        `Xóa user ${email}?\nDữ liệu thanh toán/audit được giữ. User sẽ không đăng nhập được nữa.`,
      )
    ) {
      return;
    }
    deleteMut.mutate(
      { id, reason: 'Admin xóa user' },
      {
        onSuccess: () => window.alert('Đã xóa user'),
        onError: (e) => window.alert(e instanceof Error ? e.message : 'Lỗi'),
      },
    );
  }

  if (list.isLoading) return <LoadingState />;
  if (list.isError) return <ErrorState onRetry={() => void list.refetch()} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <input
          className="h-9 rounded-md border bg-background px-3 text-sm"
          placeholder="Tìm email / tên"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
        <select
          className="h-9 rounded-md border bg-background px-2 text-sm"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Tất cả (chưa xóa)</option>
          <option value="active">Active</option>
          <option value="inactive">Locked</option>
          <option value="deleted">Đã xóa</option>
        </select>
      </div>

      {!list.data?.items.length ? (
        <p className="text-sm text-muted-foreground">Không có người dùng.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-3 py-2 text-left">User</th>
                <th className="px-3 py-2 text-left">Tổ chức</th>
                <th className="px-3 py-2 text-left">Vai trò</th>
                <th className="px-3 py-2 text-left">Trạng thái</th>
                <th className="px-3 py-2 text-left">Đăng nhập</th>
                <th className="px-3 py-2 text-left">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {list.data.items.map((u) => {
                const deleted = Boolean(u.deletedAt);
                return (
                  <tr key={u.id} className="border-t">
                    <td className="px-3 py-2">
                      <Link
                        href={`/admin/users/${u.id}`}
                        className="font-medium text-heading hover:underline"
                      >
                        {u.name}
                      </Link>
                      <div className="text-xs text-muted-foreground">{u.email}</div>
                    </td>
                    <td className="px-3 py-2 text-xs">{u.organization.name}</td>
                    <td className="px-3 py-2">
                      <Badge variant="outline">{u.role.code}</Badge>
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant="outline">
                        {deleted ? 'Deleted' : u.isActive ? 'Active' : 'Locked'}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : '—'}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        <Button size="sm" variant="outline" asChild>
                          <Link href={`/admin/users/${u.id}`}>Chi tiết</Link>
                        </Button>
                        {!deleted && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={statusMut.isPending}
                              onClick={() => lockToggle(u.id, u.email, !u.isActive)}
                            >
                              {u.isActive ? 'Khóa' : 'Mở khóa'}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={logoutMut.isPending}
                              onClick={() => forceLogout(u.id, u.email)}
                            >
                              Force logout
                            </Button>
                            {u.role.code !== 'SUPER_ADMIN' && (
                              <Button
                                size="sm"
                                variant="destructive"
                                disabled={deleteMut.isPending}
                                onClick={() => softDelete(u.id, u.email)}
                              >
                                Xóa
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="flex justify-end gap-2 border-t px-3 py-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Trước
            </Button>
            <span className="self-center text-xs text-muted-foreground">
              {page}/{list.data.totalPages}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= list.data.totalPages}
              onClick={() => setPage(page + 1)}
            >
              Sau
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
