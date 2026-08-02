'use client';

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  CheckContentAdsPanel,
  type CheckContentAdsInitial,
} from './check-content-ads-panel';
import type { ContentPolicySnapshot } from '@/lib/facebook-policy-ui';
import type { FacebookPolicyCheckPayload } from '@/types/content-marketing';

export function CheckContentAdsDrawer({
  open,
  onOpenChange,
  initial,
  onSnapshotChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: CheckContentAdsInitial | null;
  onSnapshotChange?: (
    snapshot: ContentPolicySnapshot | null,
    form: FacebookPolicyCheckPayload,
  ) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl lg:max-w-3xl">
        <SheetHeader className="mb-2 text-left">
          <SheetTitle>Check Content Ads</SheetTitle>
          <p className="text-sm text-muted-foreground">
            Nội dung đã được điền sẵn. Chọn chế độ bài đăng thường hoặc quảng cáo Meta, chỉnh sửa
            rồi kiểm tra.
          </p>
        </SheetHeader>
        <CheckContentAdsPanel
          compact
          initial={initial}
          onSnapshotChange={onSnapshotChange}
          onClose={() => onOpenChange(false)}
        />
      </SheetContent>
    </Sheet>
  );
}
