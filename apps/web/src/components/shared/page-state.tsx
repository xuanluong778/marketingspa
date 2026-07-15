import { AlertCircle, Inbox, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function LoadingState({
  message = 'Đang tải...',
  className,
}: {
  message?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-16 text-muted-foreground',
        className,
      )}
    >
      <Loader2 className="mb-3 h-8 w-8 animate-spin" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

export function EmptyState({
  title = 'Chưa có dữ liệu',
  description,
  className,
}: {
  title?: string;
  description?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-16 text-muted-foreground',
        className,
      )}
    >
      <Inbox className="mb-3 h-10 w-10" />
      <p className="font-medium text-current">{title}</p>
      {description && <p className="mt-1 text-sm opacity-90">{description}</p>}
    </div>
  );
}

export function ErrorState({
  message = 'Không thể tải dữ liệu',
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <Card className="border-destructive/50">
      <CardContent className="flex flex-col items-center justify-center py-12">
        <AlertCircle className="h-10 w-10 text-destructive mb-3" />
        <p className="font-medium">{message}</p>
        {onRetry && (
          <Button variant="outline" className="mt-4" onClick={onRetry}>
            Thử lại
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
