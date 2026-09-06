import { cn } from '@/lib/utils';

export type FeatureCardTone =
  | 'brand'
  | 'emerald'
  | 'blue'
  | 'purple'
  | 'orange'
  | 'pink'
  | 'teal'
  | 'amber';

export const FEATURE_CARD_TONES: FeatureCardTone[] = [
  'emerald',
  'blue',
  'purple',
  'orange',
  'pink',
  'teal',
  'brand',
  'amber',
];

export function featureCardToneAt(index: number): FeatureCardTone {
  return FEATURE_CARD_TONES[index % FEATURE_CARD_TONES.length]!;
}

type ToneStyle = {
  glow: string;
  iconShell: string;
  iconColor: string;
  cta: string;
  hoverBorder: string;
  hoverGlow: string;
};

export const FEATURE_TONE_STYLES: Record<FeatureCardTone, ToneStyle> = {
  brand: {
    glow: 'from-primary/25 via-primary/5 to-transparent',
    iconShell:
      'bg-gradient-to-br from-primary/25 to-primary/10 ring-primary/30 shadow-[0_0_24px_-6px_hsl(var(--primary)/0.55)]',
    iconColor: 'text-primary',
    cta: 'text-primary',
    hoverBorder: 'hover:border-primary/45',
    hoverGlow: 'hover:shadow-[0_12px_40px_-12px_hsl(var(--primary)/0.35)]',
  },
  emerald: {
    glow: 'from-emerald-400/20 via-emerald-500/5 to-transparent',
    iconShell:
      'bg-gradient-to-br from-emerald-400/25 to-emerald-600/10 ring-emerald-400/25 shadow-[0_0_24px_-6px_rgba(52,211,153,0.45)]',
    iconColor: 'text-emerald-300',
    cta: 'text-emerald-300',
    hoverBorder: 'hover:border-emerald-400/35',
    hoverGlow: 'hover:shadow-[0_12px_40px_-12px_rgba(52,211,153,0.25)]',
  },
  blue: {
    glow: 'from-sky-400/20 via-sky-500/5 to-transparent',
    iconShell:
      'bg-gradient-to-br from-sky-400/25 to-sky-600/10 ring-sky-400/25 shadow-[0_0_24px_-6px_rgba(56,189,248,0.45)]',
    iconColor: 'text-sky-300',
    cta: 'text-sky-300',
    hoverBorder: 'hover:border-sky-400/35',
    hoverGlow: 'hover:shadow-[0_12px_40px_-12px_rgba(56,189,248,0.25)]',
  },
  purple: {
    glow: 'from-violet-400/20 via-violet-500/5 to-transparent',
    iconShell:
      'bg-gradient-to-br from-violet-400/25 to-violet-600/10 ring-violet-400/25 shadow-[0_0_24px_-6px_rgba(167,139,250,0.45)]',
    iconColor: 'text-violet-300',
    cta: 'text-violet-300',
    hoverBorder: 'hover:border-violet-400/35',
    hoverGlow: 'hover:shadow-[0_12px_40px_-12px_rgba(167,139,250,0.25)]',
  },
  orange: {
    glow: 'from-orange-400/20 via-orange-500/5 to-transparent',
    iconShell:
      'bg-gradient-to-br from-orange-400/25 to-orange-600/10 ring-orange-400/25 shadow-[0_0_24px_-6px_rgba(251,146,60,0.45)]',
    iconColor: 'text-orange-300',
    cta: 'text-orange-300',
    hoverBorder: 'hover:border-orange-400/35',
    hoverGlow: 'hover:shadow-[0_12px_40px_-12px_rgba(251,146,60,0.25)]',
  },
  pink: {
    glow: 'from-pink-400/20 via-pink-500/5 to-transparent',
    iconShell:
      'bg-gradient-to-br from-pink-400/25 to-pink-600/10 ring-pink-400/25 shadow-[0_0_24px_-6px_rgba(244,114,182,0.45)]',
    iconColor: 'text-pink-300',
    cta: 'text-pink-300',
    hoverBorder: 'hover:border-pink-400/35',
    hoverGlow: 'hover:shadow-[0_12px_40px_-12px_rgba(244,114,182,0.25)]',
  },
  teal: {
    glow: 'from-teal-400/20 via-teal-500/5 to-transparent',
    iconShell:
      'bg-gradient-to-br from-teal-400/25 to-teal-600/10 ring-teal-400/25 shadow-[0_0_24px_-6px_rgba(45,212,191,0.45)]',
    iconColor: 'text-teal-300',
    cta: 'text-teal-300',
    hoverBorder: 'hover:border-teal-400/35',
    hoverGlow: 'hover:shadow-[0_12px_40px_-12px_rgba(45,212,191,0.25)]',
  },
  amber: {
    glow: 'from-amber-400/20 via-amber-500/5 to-transparent',
    iconShell:
      'bg-gradient-to-br from-amber-400/25 to-amber-600/10 ring-amber-400/25 shadow-[0_0_24px_-6px_rgba(251,191,36,0.45)]',
    iconColor: 'text-amber-300',
    cta: 'text-amber-300',
    hoverBorder: 'hover:border-amber-400/35',
    hoverGlow: 'hover:shadow-[0_12px_40px_-12px_rgba(251,191,36,0.25)]',
  },
};

export function mazFeatureCardShellClass(
  tone: FeatureCardTone = 'brand',
  className?: string,
) {
  const t = FEATURE_TONE_STYLES[tone];
  return cn(
    'group relative flex h-full min-h-[168px] flex-col overflow-hidden rounded-[17px] p-5',
    'border border-white/[0.12]',
    'bg-gradient-to-br from-white/[0.07] via-white/[0.03] to-transparent',
    'shadow-[0_1px_0_0_rgba(255,255,255,0.06)_inset,0_8px_32px_-12px_rgba(0,0,0,0.4)]',
    'transition-all duration-300 ease-out',
    'hover:-translate-y-0.5 hover:bg-white/[0.09]',
    t.hoverBorder,
    t.hoverGlow,
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    className,
  );
}

export function mazFeatureCardGlowClass(tone: FeatureCardTone = 'brand') {
  return cn(
    'pointer-events-none absolute -left-8 -top-8 h-32 w-32 rounded-full bg-gradient-to-br opacity-70 blur-2xl transition-opacity duration-300 group-hover:opacity-100',
    FEATURE_TONE_STYLES[tone].glow,
  );
}

export function mazIconGlassClass(tone: FeatureCardTone = 'brand') {
  const t = FEATURE_TONE_STYLES[tone];
  return cn(
    'relative flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] ring-1',
    'shadow-[inset_0_1px_0_0_rgba(255,255,255,0.22),0_6px_16px_-4px_rgba(0,0,0,0.45)]',
    'transition-transform duration-300 group-hover:scale-[1.04]',
    t.iconShell,
  );
}

/** Shared glass surface for stat/info panels (non-link cards). */
export function mazCardSurfaceClass(className?: string) {
  return cn(
    'rounded-[17px] border border-white/[0.12]',
    'bg-gradient-to-br from-white/[0.07] via-white/[0.03] to-transparent',
    'shadow-[0_1px_0_0_rgba(255,255,255,0.06)_inset,0_8px_32px_-12px_rgba(0,0,0,0.4)]',
    className,
  );
}
