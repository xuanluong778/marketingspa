'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ErrorState, LoadingState } from '@/components/shared/page-state';
import { formatDateTime } from '@/lib/format';
import { useAdminOrganizations, useAdminOrgStatus } from '@/hooks/use-platform-admin';

export default function AdminOrganizationsPage() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const list = useAdminOrganizations({ q, status, page, pageSize: 20 });
  const mut = useAdminOrgStatus();

  function act(id: string, name: string, isActive: boolean) {
    const reason = window.prompt(
      `${isActive ? 'Mở khóa' : 'Khóa'} tổ chức "${name}".\nNhập lý do (bắt buộc):`,
    );
    if (!reason || reason.trim().length < 3) return;
    const confirmMsg = `Xác nhận ${isActive ? 'MỞ' : 'KHÓA'} tổ chức?\nTrước: isActive=${!isActive}\nSau: isActive=${isActive}`;
    if (!window.confirm(confirmMsg)) return;
    mut.mutate(
      { id, isActive, reason: reason.trim() },
      {
        onSuccess: () => window.alert('Đã cập nhật + ghi audit log'),
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
          placeholder="Tìm tên / slug / email"
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
          <option value="">Tất cả</option>
          <option value="active">Đang hoạt động</option>
          <option value="inactive">Đã khóa</option>
        </select>
      </div>

      {!list.data?.items.length ? (
        <p className="text-sm text-muted-foreground">Không có tổ chức phù hợp.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-3 py-2 text-left">Tổ chức</th>
                <th className="px-3 py-2 text-left">Gói</th>
                <th className="px-3 py-2 text-left">Users</th>
                <th className="px-3 py-2 text-left">Trạng thái</th>
                <th className="px-3 py-2 text-left">Tạo lúc</th>
                <th className="px-3 py-2 text-left">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {list.data.items.map((o) => (
                <tr key={o.id} className="border-t">
                  <td className="px-3 py-2">
                    <div className="font-medium">{o.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {o.slug} · {o.email ?? '—'}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {o.currentSubscription ? (
                      <>
                        {o.currentSubscription.planName}
                        <div className="text-muted-foreground">
                          còn {o.currentSubscription.remainingDays} ngày
                        </div>
                      </>
                    ) : (
                      'Chưa có gói'
                    )}
                  </td>
                  <td className="px-3 py-2">{o.userCount}</td>
                  <td className="px-3 py-2">
                    <Badge variant="outline">{o.isActive ? 'Active' : 'Locked'}</Badge>
                  </td>
                  <td className="px-3 py-2 text-xs">{formatDateTime(o.createdAt)}</td>
                  <td className="px-3 py-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={mut.isPending}
                      onClick={() => act(o.id, o.name, !o.isActive)}
                    >
                      {o.isActive ? 'Khóa' : 'Mở khóa'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-end gap-2 border-t px-3 py-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Trước
            </Button>
            <span className="text-xs text-muted-foreground self-center">
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
