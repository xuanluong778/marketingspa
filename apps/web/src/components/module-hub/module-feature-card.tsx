'use client';

import type { LucideIcon } from 'lucide-react';
import { FeatureCard } from '@/components/shared/feature-card';
import { featureCardToneAt } from '@/lib/card-design-system';
import { useT } from '@/i18n/i18n-provider';

export function ModuleFeatureCard({
  title,
  description,
  href,
  icon,
  badge,
  toneIndex = 0,
  className,
}: {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  badge?: string | number | null;
  toneIndex?: number;
  className?: string;
}) {
  const t = useT();
  const ctaLabel = t('moduleHub.viewDetails');

  return (
    <FeatureCard
      href={href}
      title={title}
      description={description}
      icon={icon}
      tone={featureCardToneAt(toneIndex)}
      badge={badge}
      ctaLabel={ctaLabel}
      className={className}
    />
  );
}
