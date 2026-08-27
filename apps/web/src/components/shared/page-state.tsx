'use client';

import { AlertCircle, Inbox, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useT } from '@/i18n/i18n-provider';
import { cn } from '@/lib/utils';

export function LoadingState({
  message,
  className,
}: {
  message?: string;
  className?: string;
}) {
  const t = useT();
  const displayMessage = message ?? t('common.loading');

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-16 text-muted-foreground',
        className,
      )}
    >
      <Loader2 className="mb-3 h-8 w-8 animate-spin" />
      <p className="text-sm">{displayMessage}</p>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  className,
}: {
  title?: string;
  description?: string;
  className?: string;
}) {
  const t = useT();
  const displayTitle = title ?? t('common.emptyData');

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-16 text-muted-foreground',
        className,
      )}
    >
      <Inbox className="mb-3 h-10 w-10" />
      <p className="font-medium text-current">{displayTitle}</p>
      {description && <p className="mt-1 text-sm opacity-90">{description}</p>}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  const t = useT();
  const displayMessage = message ?? t('common.errorLoad');

  return (
    <Card className="border-destructive/50">
      <CardContent className="flex flex-col items-center justify-center py-12">
        <AlertCircle className="h-10 w-10 text-destructive mb-3" />
        <p className="font-medium">{displayMessage}</p>
        {onRetry && (
          <Button variant="outline" className="mt-4" onClick={onRetry}>
            {t('common.retry')}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
