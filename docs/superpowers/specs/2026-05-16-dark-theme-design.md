# Dark Theme Design — Divit

Date: 2026-05-16

## Overview

Replace the current cool blue/indigo theme with a warm espresso + gold palette derived directly from the app icon. Dark mode is the default. Light mode remains available via a toggle in Settings → Profile tab, persisted in localStorage.

## Color Palettes

### Dark Mode (default)

| CSS Variable | Value | Role |
|---|---|---|
| `--background` | `hsl(30, 20%, 9%)` | Warm espresso black (matches icon bg) |
| `--foreground` | `hsl(38, 30%, 90%)` | Warm off-white text |
| `--card` | `hsl(30, 22%, 11%)` | Slightly lifted card surface |
| `--card-foreground` | `hsl(38, 30%, 90%)` | Card text |
| `--popover` | `hsl(30, 22%, 11%)` | Popover surface |
| `--popover-foreground` | `hsl(38, 30%, 90%)` | Popover text |
| `--primary` | `hsl(42, 60%, 55%)` | Icon gold — primary accent |
| `--primary-foreground` | `hsl(30, 20%, 9%)` | Dark text on gold buttons |
| `--secondary` | `hsl(30, 18%, 16%)` | Elevated panel / secondary surface |
| `--secondary-foreground` | `hsl(38, 25%, 80%)` | Secondary surface text |
| `--muted` | `hsl(30, 18%, 14%)` | Subtle background tint |
| `--muted-foreground` | `hsl(35, 20%, 55%)` | Subdued label / caption text |
| `--accent` | `hsl(42, 50%, 45%)` | Deeper gold for hover/active states |
| `--accent-foreground` | `hsl(38, 30%, 90%)` | Accent text |
| `--destructive` | `hsl(4, 68%, 55%)` | Error red |
| `--destructive-foreground` | `hsl(38, 30%, 90%)` | Text on destructive |
| `--border` | `hsl(33, 25%, 18%)` | Warm dark border |
| `--input` | `hsl(33, 25%, 18%)` | Input border |
| `--ring` | `hsl(42, 60%, 55%)` | Gold focus ring |
| `--success` | `hsl(158, 50%, 45%)` | Success green |
| `--warning` | `hsl(38, 88%, 55%)` | Amber warning |
| `--info` | `hsl(206, 70%, 60%)` | Info blue |

### Light Mode

| CSS Variable | Value | Role |
|---|---|---|
| `--background` | `hsl(40, 30%, 97%)` | Warm cream (not stark white) |
| `--foreground` | `hsl(30, 30%, 12%)` | Warm near-black (espresso tone) |
| `--card` | `hsl(38, 40%, 99%)` | Slightly warm white card |
| `--card-foreground` | `hsl(30, 30%, 12%)` | Card text |
| `--popover` | `hsl(38, 40%, 99%)` | Popover surface |
| `--popover-foreground` | `hsl(30, 30%, 12%)` | Popover text |
| `--primary` | `hsl(42, 65%, 40%)` | Rich gold (deeper for light-bg contrast) |
| `--primary-foreground` | `hsl(38, 40%, 98%)` | Near-white on gold |
| `--secondary` | `hsl(35, 20%, 93%)` | Warm light gray surface |
| `--secondary-foreground` | `hsl(30, 25%, 20%)` | Secondary text |
| `--muted` | `hsl(35, 20%, 95%)` | Barely-there warm tint |
| `--muted-foreground` | `hsl(30, 15%, 45%)` | Warm medium gray |
| `--accent` | `hsl(42, 55%, 35%)` | Deep gold accent |
| `--accent-foreground` | `hsl(38, 40%, 98%)` | Text on accent |
| `--destructive` | `hsl(4, 70%, 50%)` | Error red |
| `--destructive-foreground` | `hsl(38, 40%, 98%)` | Text on destructive |
| `--border` | `hsl(35, 20%, 85%)` | Warm light border |
| `--input` | `hsl(35, 20%, 85%)` | Input border |
| `--ring` | `hsl(42, 65%, 40%)` | Gold focus ring |
| `--success` | `hsl(158, 50%, 38%)` | Success green |
| `--warning` | `hsl(38, 90%, 48%)` | Amber warning |
| `--info` | `hsl(206, 70%, 50%)` | Info blue |

### Gradient Updates

**Dark:** `linear-gradient(135deg, hsl(42, 65%, 45%) 0%, hsl(33, 40%, 25%) 50%, hsl(30, 20%, 9%) 100%)`  
**Light:** `linear-gradient(135deg, hsl(42, 65%, 42%) 0%, hsl(35, 50%, 55%) 50%, hsl(38, 30%, 75%) 100%)`

## Architecture

### ThemeContext (`src/contexts/ThemeContext.tsx`)

New context that:
- Reads initial theme from `localStorage.getItem('theme')`, defaulting to `'dark'`
- Applies/removes the `dark` CSS class on `<html>` element
- Exposes `{ theme, toggleTheme }` to consumers
- Persists choice to `localStorage` on change

### App Integration (`src/App.tsx` or root component)

Wrap the app with `<ThemeProvider>`. On mount, apply the stored or default (`dark`) theme class to `<html>`.

### Settings Toggle (Settings → Profile tab)

Add a dark/light mode toggle row in the Profile settings card, alongside the existing Venmo ID field. Use a `Switch` (shadcn/ui) with a sun/moon icon pair. Reads from and writes to `ThemeContext`.

### CSS (`src/index.css`)

- `:root` → light mode variables (warm cream + rich gold)
- `.dark` → dark mode variables (espresso + icon gold)
- Update `--gradient-hero` for both modes
- Update any hardcoded shadow/glow colors that reference the old indigo palette

## Scope

**In scope:**
- CSS variables (`:root` and `.dark`) in `src/index.css`
- `ThemeContext` with localStorage persistence
- Default-dark initialization in root
- Settings toggle UI

**Out of scope:**
- Per-user theme preference synced to Firestore (localStorage only)
- System preference (`prefers-color-scheme`) detection — dark is always the default regardless
- Any component-specific color overrides unless they hardcode colors outside the CSS variable system
