'use client';

import { useMemo, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CheckContentAdsDrawer } from './check-content-ads-drawer';
import { FacebookPolicyStatusBadge } from './facebook-policy-status-badge';
import {
  payloadFromPostFields,
  type ContentPolicySnapshot,
  type PolicyCheckMode,
} from '@/lib/facebook-policy-ui';
import type { FacebookPolicyCheckPayload, SpecialAdCategory } from '@/types/content-marketing';
import { cn } from '@/lib/utils';

export type CheckContentAdsButtonProps = {
  title?: string;
  content?: string;
  cta?: string;
  landingUrl?: string;
  productService?: string;
  imageOcrText?: string;
  transcript?: string;
  specialAdCategory?: SpecialAdCategory;
  historyId?: string;
  mode?: PolicyCheckMode;
  snapshot?: ContentPolicySnapshot | null;
  onSnapshotChange?: (
    snapshot: ContentPolicySnapshot | null,
    form: FacebookPolicyCheckPayload,
  ) => void;
  disabled?: boolean;
  size?: 'sm' | 'default' | 'lg';
  variant?: 'outline' | 'secondary' | 'default' | 'ghost';
  className?: string;
  showBadge?: boolean;
  label?: string;
};

/**
 * Shared “Check Content Ads” entry — opens drawer with autofilled fields.
 */
export function CheckContentAdsButton({
  title,
  content,
  cta,
  landingUrl,
  productService,
  imageOcrText,
  transcript,
  specialAdCategory,
  historyId,
  mode = 'meta_ads',
  snapshot,
  onSnapshotChange,
  disabled,
  size = 'sm',
  variant = 'outline',
  className,
  showBadge = true,
  label = 'Check Content Ads',
}: CheckContentAdsButtonProps) {
  const [open, setOpen] = useState(false);

  const initial = useMemo(
    () => ({
      ...payloadFromPostFields({
        title,
        content,
        cta,
        landingUrl,
        productService,
        imageOcrText,
        transcript,
        specialAdCategory,
      }),
      mode,
      historyId,
    }),
    [
      title,
      content,
      cta,
      landingUrl,
      productService,
      imageOcrText,
      transcript,
      specialAdCategory,
      mode,
      historyId,
    ],
  );

  const payloadForBadge = payloadFromPostFields({
    title,
    content,
    cta,
    landingUrl,
    productService,
    imageOcrText,
    transcript,
    specialAdCategory,
  });

  return (
    <>
      <div className="inline-flex flex-nowrap items-center gap-1.5">
        <Button
          type="button"
          size={size}
          variant={variant}
          className={cn(className)}
          disabled={disabled || !(content || '').trim()}
          onClick={() => setOpen(true)}
        >
          <ShieldAlert className="mr-1 h-4 w-4" />
          {label}
        </Button>
        {showBadge ? (
          <FacebookPolicyStatusBadge snapshot={snapshot} payload={payloadForBadge} />
        ) : null}
      </div>
      <CheckContentAdsDrawer
        open={open}
        onOpenChange={setOpen}
        initial={initial}
        onSnapshotChange={onSnapshotChange}
      />
    </>
  );
}
