'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  FEATURE_TONE_STYLES,
  type FeatureCardTone,
  mazFeatureCardGlowClass,
  mazFeatureCardShellClass,
  mazIconGlassClass,
} from '@/lib/card-design-system';

export type FeatureCardBadge = 'hot' | 'new' | string | number;

export interface FeatureCardProps {
  href: string;
  title: string;
  description?: string;
  icon: LucideIcon;
  tone?: FeatureCardTone;
  badge?: FeatureCardBadge | null;
  ctaLabel?: string;
  className?: string;
}

function FeatureCardBadgePill({ badge }: { badge: FeatureCardBadge }) {
  if (badge === 'hot') {
    return (
      <span className="rounded-full border-0 bg-gradient-to-r from-orange-500/90 to-rose-500/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white shadow-sm">
        HOT
      </span>
    );
  }
  if (badge === 'new') {
    return (
      <span className="rounded-full bg-primary/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground shadow-sm">
        Mới
      </span>
    );
  }
  return (
    <span className="rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[11px] font-medium text-white/85">
      {badge}
    </span>
  );
}

export function FeatureCard({
  href,
  title,
  description,
  icon: Icon,
  tone = 'brand',
  badge,
  ctaLabel = 'Xem chi tiết',
  className,
}: FeatureCardProps) {
  const toneStyle = FEATURE_TONE_STYLES[tone];

  return (
    <Link href={href} className={cn(mazFeatureCardShellClass(tone), className)}>
      <span aria-hidden className={mazFeatureCardGlowClass(tone)} />

      <div className="relative mb-4 flex items-start justify-between gap-3">
        <div className={mazIconGlassClass(tone)}>
          <Icon className={cn('h-6 w-6', toneStyle.iconColor)} aria-hidden />
        </div>
        {badge != null && badge !== '' ? <FeatureCardBadgePill badge={badge} /> : null}
      </div>

      <h3 className="relative text-[15px] font-semibold leading-snug tracking-tight text-white">
        {title}
      </h3>

      {description ? (
        <p className="relative mt-1.5 line-clamp-2 flex-1 text-[13px] leading-relaxed text-white/65">
          {description}
        </p>
      ) : (
        <span className="flex-1" />
      )}

      <span
        className={cn(
          'relative mt-4 inline-flex items-center gap-1 text-[13px] font-medium transition-all duration-300 group-hover:gap-1.5',
          toneStyle.cta,
        )}
      >
        {ctaLabel}
        <ArrowRight
          className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5"
          aria-hidden
        />
      </span>
    </Link>
  );
}
