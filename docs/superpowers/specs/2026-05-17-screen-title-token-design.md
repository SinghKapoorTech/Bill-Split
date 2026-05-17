# Screen Title Token Design

**Date:** 2026-05-17
**Scope:** Dashboard title styling + reusable screen-header tokens in `styles.ts`

## Problem

The Dashboard title ("Welcome back, Alex") uses a different font size, color, and spacing than every other screen title in the app (e.g. "Your Events", "My Squads"). There is no shared token to enforce consistency, so each page has hand-rolled its own variant.

## Goal

1. Make the Dashboard title look identical to "Your Events" — same size, same color, same spacing on mobile.
2. Introduce a centralized, reusable token set in `src/lib/styles.ts` so future pages (or existing ones) can adopt the same pattern with one line each.

## Design

### Token additions — `src/lib/styles.ts`

Add a `screen` group inside the existing `layout` object:

```ts
screen: {
  title:      'text-3xl font-bold',
  subtitle:   'text-muted-foreground',
  headerWrap: 'mb-6',
}
```

- `title` — the `<h1>` style. Matches `EventsView` exactly: `text-3xl font-bold`, no color modifier (inherits `text-foreground`, which is off-white in dark mode, near-black in light mode).
- `subtitle` — the optional supporting line beneath the title. Matches `EventsView`'s subtitle paragraph.
- `headerWrap` — bottom margin on the wrapper div that holds the title block. `mb-6` (24px) matches `EventsView`.

Usage pattern (any page):
```tsx
<div className={layout.screen.headerWrap}>
  <h1 className={layout.screen.title}>Your Events</h1>
  <p className={layout.screen.subtitle}>Organize trips and group events</p>
</div>
```

Pages without a subtitle just omit the `<p>`:
```tsx
<div className={layout.screen.headerWrap}>
  <h1 className={layout.screen.title}>Welcome back, Alex</h1>
</div>
```

### Page-container fix — `src/lib/styles.ts`

`layout.page` currently uses `py-4 md:py-8`, which gives mobile 16px top padding vs EventsView's consistent 32px. Since `layout.page` is only used by Dashboard, update it:

```ts
// before
page: 'container mx-auto px-4 py-4 md:py-8 max-w-7xl',

// after
page: 'container mx-auto px-4 py-8 max-w-7xl',
```

### Dashboard changes — `src/pages/Dashboard.tsx`

Replace the existing title block:
```tsx
// before
<div className="mb-4 md:mb-8">
  <h1 className="text-2xl md:text-4xl font-bold mb-2 text-primary-glow">
    Welcome back{user?.displayName ? `, ${user.displayName.split(' ')[0]}` : ''}
  </h1>
</div>

// after
<div className={layout.screen.headerWrap}>
  <h1 className={layout.screen.title}>
    Welcome back{user?.displayName ? `, ${user.displayName.split(' ')[0]}` : ''}
  </h1>
</div>
```

## Mobile Spacing Comparison (after)

| | Events | Dashboard |
|---|---|---|
| Page top padding | `py-8` (32px) | `py-8` (32px) |
| Title-to-content gap | `mb-6` (24px) | `mb-6` (24px) |
| Title font | `text-3xl font-bold` | `text-3xl font-bold` |
| Title color | `text-foreground` | `text-foreground` |

## Files Changed

| File | Change |
|---|---|
| `src/lib/styles.ts` | Add `layout.screen.{title,subtitle,headerWrap}`; update `layout.page` to `py-8` |
| `src/pages/Dashboard.tsx` | Swap title block to use new tokens |

## Out of Scope

- Updating other pages (Events, Squads, Settings, etc.) to use `layout.screen.*` — left for a future pass.
- Any changes to section labels, card layouts, or content spacing below the title.
