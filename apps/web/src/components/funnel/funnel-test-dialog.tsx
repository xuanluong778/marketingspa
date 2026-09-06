'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadingState } from '@/components/shared/page-state';
import { useFunnelRecommendation } from '@/hooks/use-funnel-builder';

export function publicFunnelUrl(funnelId: string) {
  if (typeof window === 'undefined') return `/f/${funnelId}`;
  return `${window.location.origin}/f/${funnelId}`;
}

export function FunnelTestDialog({
  funnelId,
  open,
  onOpenChange,
}: {
  funnelId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const detail = useFunnelRecommendation(open ? funnelId : null);
  const spec = detail.data?.completeSpec ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
            <DialogTitle>Test thử form khách</DialogTitle>
            <DialogDescription>
              Đây là form khách sẽ thấy. Sau khi phễu đang chạy, dùng Copy link để gửi thật.
            </DialogDescription>
        </DialogHeader>
        {detail.isLoading ? (
          <LoadingState message="Đang tải form…" />
        ) : !spec ? (
          <p className="text-sm text-muted-foreground">
            Phễu chưa có form để test. Bấm Chỉnh sửa để hoàn tất thiết kế.
          </p>
        ) : (
          <div className="space-y-3">
            <p className="font-medium">{spec.name}</p>
            <p className="text-sm text-muted-foreground">{spec.offer}</p>
            {spec.leadForm.fields.map((field) => (
              <div key={field.key} className="space-y-1">
                <Label>
                  {field.label}
                  {field.required ? ' *' : ''}
                </Label>
                <Input disabled placeholder={field.placeholder || field.label} />
              </div>
            ))}
            <Button disabled className="w-full">
              {spec.leadForm.submitLabel || spec.cta || 'Gửi'}
            </Button>
            {funnelId && (
              <p className="break-all text-xs text-muted-foreground">{publicFunnelUrl(funnelId)}</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
