import { AlertCircle, Inbox, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export function LoadingState({ message = 'Đang tải...' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
      <Loader2 className="h-8 w-8 animate-spin mb-3" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

export function EmptyState({
  title = 'Chưa có dữ liệu',
  description,
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
      <Inbox className="h-10 w-10 mb-3" />
      <p className="font-medium text-foreground">{title}</p>
      {description && <p className="text-sm mt-1">{description}</p>}
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
