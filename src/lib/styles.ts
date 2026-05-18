// Shared semantic style tokens for the app.
//
// Rules:
//  - Add here when a style set appears in 2+ components or represents a named semantic state.
//  - Use Tailwind utility classes only — no raw CSS values except in `accentBorder` (dynamic inline-style values).
//  - `style={}` in components is only for values computed from runtime data (e.g. borderLeftColor). Everything static lives here.

// ─── Bill settlement status ────────────────────────────────────────────────

export const status = {
  // Badge shape — apply alongside a color entry below.
  pill: 'inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider shrink-0',

  color: {
    draft:     'text-muted-foreground bg-muted/60',
    settled:   'text-success bg-success/15',
    partial:   'text-warning bg-warning/15',
    unsettled: 'text-destructive bg-destructive/15',
  },

  label: {
    draft:     'Draft',
    settled:   'Settled',
    partial:   'Partial',
    unsettled: 'Not Settled',
  },
} as const;

// ─── Balance direction (you-owe / owes-you / neutral) ─────────────────────

export const balanceDir = {
  // Icon chip next to the direction label
  badge: {
    'you-owe':  'bg-destructive/10 text-destructive',
    'owes-you': 'bg-success/10 text-success',
    neutral:    'bg-muted/60 text-muted-foreground',
  },

  // Avatar fallback background + text when no photo is available
  fallback: {
    'you-owe':  'bg-destructive/10 text-destructive',
    'owes-you': 'bg-success/10 text-success',
    neutral:    'bg-muted text-muted-foreground',
  },

  // CSS color value used in style={{ borderLeftColor }} — kept as inline style because it's dynamic
  accentBorder: {
    'you-owe':  'hsl(var(--destructive))',
    'owes-you': 'hsl(var(--success))',
    neutral:    'hsl(var(--muted-foreground) / 0.2)',
  },

  // Pay / Settle action button colors
  action: {
    'you-owe':  'bg-destructive hover:bg-destructive/90 text-destructive-foreground border-none shadow-sm',
    'owes-you': 'bg-success hover:bg-success/90 text-success-foreground border-none shadow-sm',
    neutral:    'bg-success hover:bg-success/90 text-success-foreground border-none shadow-sm',
  },

  // Swipe-reveal action panel (mobile)
  swipePanel: {
    'you-owe':  'bg-destructive text-destructive-foreground',
    'owes-you': 'bg-success text-success-foreground',
    neutral:    'bg-success text-success-foreground',
  },
} as const;

// ─── Chip / pill buttons ───────────────────────────────────────────────────

export const chip = {
  // Small rounded pill — matches the Friends header chip shape
  sm: 'rounded-full h-7 px-2.5 text-[11px] font-medium gap-1.5',
} as const;

// ─── Balance list row text ─────────────────────────────────────────────────

export const balanceRow = {
  // Friend name — adapts to theme (dark on light, white on dark)
  name:   'text-[15px] text-foreground truncate leading-tight',
  // Direction label ("You owe", "owes you") — matches amount color/weight
  status: 'text-xs text-primary',
} as const;

// ─── Layout helpers ────────────────────────────────────────────────────────

export const layout = {
  // Standard page wrapper used by all top-level page components
  page:         'container mx-auto px-4 py-8 max-w-7xl',

  // "BALANCES", "MY BILLS" section heading style
  sectionLabel: 'text-sm font-medium text-muted-foreground uppercase tracking-wider',

  // Screen-level title block — use these together for consistent page headers
  screen: {
    headerWrap: 'mb-6',
    title:      'text-3xl font-bold',
    subtitle:   'text-muted-foreground',
  },
} as const;
