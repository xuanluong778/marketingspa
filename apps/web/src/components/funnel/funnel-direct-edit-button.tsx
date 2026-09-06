'use client';

import Link from 'next/link';
import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { funnelPreviewHref } from '@/lib/funnel-tabs';

export function FunnelDirectEditButton({
  funnelId,
  size = 'sm',
  variant = 'secondary',
  className,
}: {
  funnelId: string;
  size?: 'sm' | 'default';
  variant?: 'secondary' | 'outline' | 'default';
  className?: string;
}) {
  return (
    <Button size={size} variant={variant} className={className} asChild>
      <Link href={funnelPreviewHref(funnelId)}>
        <Pencil className="mr-1 h-3.5 w-3.5" />
        Sửa trực tiếp
      </Link>
    </Button>
  );
}
