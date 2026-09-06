'use client';

import { ZaloOaConnectionsPanel } from '@/components/settings/zalo-oa-connections-panel';

/**
 * Cài đặt → Kết nối — quản lý kênh OA / tích hợp theo tổ chức.
 * Hiện tại: Zalo OA (POST /api/v1/zalo/connections).
 */
export function SettingsConnectionsPanel() {
  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-lg font-semibold mb-1">Kết nối</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Quản lý kết nối kênh theo tổ chức. Credentials chỉ gửi lên server khi lưu và được mã hóa
          trên backend — không lưu plaintext trên trình duyệt.
        </p>
      </div>
      <ZaloOaConnectionsPanel />
    </div>
  );
}
