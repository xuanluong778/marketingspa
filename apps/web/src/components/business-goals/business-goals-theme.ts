/** Theme boxes tab Mục tiêu kinh doanh */
export const BG_BOX = 'bg-[#0B2115] text-white border border-white/10 shadow-sm';

export const BG_BOX_MUTED = 'text-white/70';

export const BG_BOX_INNER = 'bg-white/5 border border-white/10 text-white';

export const BG_BOX_HOVER = 'hover:bg-white/10';

/** Input/select bên trong box tối */
export const BG_BOX_FIELDS =
  '[&_input]:bg-white/10 [&_input]:text-white [&_input]:border-white/20 [&_input::placeholder]:text-white/40 [&_textarea]:bg-white/10 [&_textarea]:text-white [&_label]:text-white [&_.text-muted-foreground]:text-white/65';

export const STATUS_BORDER = {
  profit: 'border-emerald-400/50',
  loss: 'border-red-400/50',
  break_even: 'border-amber-400/50',
} as const;
