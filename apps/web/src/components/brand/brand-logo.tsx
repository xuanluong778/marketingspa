'use client';

import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/utils';

type BrandLogoProps = {
  size?: number;
  href?: string | null;
  wordmark?: string | false;
  wordmarkClassName?: string;
  className?: string;
  priority?: boolean;
  showWordmark?: boolean;
};

export function BrandLogo({
  size = 40,
  href = '/',
  wordmark = 'MarketingAutoAZ',
  wordmarkClassName,
  className,
  priority = false,
  showWordmark = true,
}: BrandLogoProps) {
  const mark =
    showWordmark && wordmark !== false ? (
      <span className={cn('font-bold tracking-tight text-white', wordmarkClassName)}>
        {wordmark || 'MarketingAutoAZ'}
      </span>
    ) : null;

  const inner = (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <Image
        src="/brand/logo.png"
        alt="MarketingAutoAZ"
        width={size}
        height={size}
        priority={priority}
        className="rounded-md object-contain"
      />
      {mark}
    </span>
  );

  if (href === null) return inner;
  return (
    <Link href={href || '/'} className="inline-flex items-center gap-2 no-underline">
      {inner}
    </Link>
  );
}

export default BrandLogo;
