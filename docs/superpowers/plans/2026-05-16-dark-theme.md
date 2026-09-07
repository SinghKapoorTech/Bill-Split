# Dark Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the indigo/slate color palette with a warm espresso + gold palette derived from the app icon, default to dark mode, and add a light/dark toggle in Settings → Profile.

**Architecture:** A new `ThemeContext` manages the active theme (`'dark' | 'light'`), persists it to `localStorage` (defaulting to `'dark'`), and applies/removes the `dark` CSS class on `<html>`. The CSS variables in `src/index.css` are updated to the new palettes for both `:root` (light) and `.dark` (dark). The toggle lives in `ProfileSettingsCard`.

**Tech Stack:** React context, localStorage, Tailwind CSS (class-based dark mode), shadcn/ui Switch component, Lucide icons.

---

### Task 1: Create ThemeContext

**Files:**
- Create: `src/contexts/ThemeContext.tsx`

- [ ] **Step 1: Create the context file**

```tsx
import { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'dark' | 'light';

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem('theme') as Theme) ?? 'dark';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => (t === 'dark' ? 'light' : 'dark'));

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
```

- [ ] **Step 2: Verify file was created**

Run: `ls src/contexts/`
Expected: `ThemeContext.tsx` appears in the list alongside `AuthContext.tsx` and `BillSessionContext.tsx`.

---

### Task 2: Wrap App with ThemeProvider

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add ThemeProvider import**

In `src/App.tsx`, add this import after the existing context imports (around line 9):

```tsx
import { ThemeProvider } from "@/contexts/ThemeContext";
```

- [ ] **Step 2: Wrap the app with ThemeProvider**

In `src/App.tsx`, the `App` component currently returns:

```tsx
const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
```

Replace with:

```tsx
const App = () => (
  <ThemeProvider>
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
```

And close the `ThemeProvider` at the end. The full component becomes:

```tsx
const App = () => (
  <ThemeProvider>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SettlementRequestsProvider>
        <BillSessionProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
              <DeepLinkHandler />
              <Routes>
                {/* Public: Platform-aware root route */}
                <Route path="/" element={<RootRoute />} />

                {/* Protected routes with layout */}
                <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
                  <Route path="dashboard" element={<Dashboard />} />
                  <Route path="bill/:billId" element={<AIScanView />} />
                  <Route path="transaction/:billId" element={<SimpleTransactionView />} />
                  <Route path="airbnb/:billId" element={<AirbnbView />} />
                  <Route path="events" element={<EventsView />} />
                  <Route path="events/:eventId" element={<EventDetailView />} />
                  <Route path="squads" element={<SquadsView />} />
                  <Route path="squads/:squadId" element={<SquadDetailView />} />
                  <Route path="balances/:targetUserId" element={<BalanceDetailView />} />
                  <Route path="events/:eventId/balances/:targetUserId" element={<BalanceDetailView />} />
                  <Route path="settings" element={<SettingsView />} />
                  <Route path="shared/:sessionId" element={<CollaborativeSessionView />} />
                </Route>

                {/* Public: Auth, join, and collaborative session pages */}
                <Route path="/auth" element={<Auth />} />
                <Route path="/join/:sessionId" element={<JoinSession />} />
                <Route path="/session/:sessionId" element={<CollaborativeSessionView />} />

                {/* Public: legal pages */}
                <Route path="/privacy" element={<PrivacyPolicy />} />

                {/* Public: 404 */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </TooltipProvider>
        </BillSessionProvider>
        </SettlementRequestsProvider>
      </AuthProvider>
    </QueryClientProvider>
  </ThemeProvider>
);
```

- [ ] **Step 3: Verify no TypeScript errors**

Run: `npx tsc --noEmit`
Expected: No errors related to ThemeProvider or ThemeContext.

---

### Task 3: Update CSS variables in index.css

**Files:**
- Modify: `src/index.css`

- [ ] **Step 1: Replace the entire `:root` block**

In `src/index.css`, replace the entire `:root { ... }` block (lines 17–106) with:

```css
  :root {
    /* ============================================
       LIGHT MODE — Warm Cream + Rich Gold
       Complementary to the Divit icon palette
       ============================================ */

    --background: 40 30% 97%;
    --foreground: 30 30% 12%;

    --card: 38 40% 99%;
    --card-foreground: 30 30% 12%;

    --popover: 38 40% 99%;
    --popover-foreground: 30 30% 12%;

    --surface-elevated: 38 30% 97%;

    /* Primary - Rich Gold (readable on light background) */
    --primary: 42 65% 40%;
    --primary-foreground: 38 40% 98%;
    --primary-glow: 42 65% 55%;

    /* Secondary - Warm light gray */
    --secondary: 35 20% 93%;
    --secondary-foreground: 30 25% 20%;

    /* Muted - Barely-there warm tint */
    --muted: 35 20% 95%;
    --muted-foreground: 30 15% 45%;

    /* Accent - Deep gold for hover/active */
    --accent: 42 55% 35%;
    --accent-foreground: 38 40% 98%;

    /* Success - Warm green */
    --success: 158 50% 38%;
    --success-foreground: 38 40% 98%;

    /* Info - Blue */
    --info: 206 70% 50%;
    --info-foreground: 38 40% 98%;

    /* Warning - Amber */
    --warning: 38 90% 48%;
    --warning-foreground: 30 30% 12%;

    /* Destructive - Red */
    --destructive: 4 70% 50%;
    --destructive-foreground: 38 40% 98%;

    /* Borders and inputs - Warm light */
    --border: 35 20% 85%;
    --input: 35 20% 87%;
    --ring: 42 65% 40%;

    --radius: 0.75rem;

    /* Gradients */
    --gradient-hero: linear-gradient(135deg, hsl(42, 65%, 42%) 0%, hsl(35, 50%, 55%) 50%, hsl(38, 30%, 75%) 100%);
    --gradient-subtle: linear-gradient(180deg, hsl(40, 30%, 97%) 0%, hsl(38, 25%, 94%) 100%);

    /* Shadows */
    --shadow-soft: 0 2px 12px -2px hsl(30 20% 12% / 0.06);
    --shadow-medium: 0 4px 20px -4px hsl(30 20% 12% / 0.10);
    --shadow-strong: 0 8px 32px -8px hsl(30 20% 12% / 0.15);

    --transition-smooth: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);

    /* Parallax Gradient Colors - Warm Gold tones */
    --gradient-cyan-primary: 42 65% 40%;
    --gradient-cyan-bright: 42 70% 52%;
    --gradient-teal: 35 55% 50%;
    --gradient-blue: 30 45% 40%;
    --gradient-coral: 38 75% 55%;
    --gradient-pink: 42 60% 48%;
    --gradient-purple: 35 50% 42%;
    --gradient-amber: 38 90% 50%;

    /* Parallax Layer Opacities */
    --parallax-bg-opacity: 0.08;
    --parallax-mid-opacity: 0.12;
    --parallax-fg-opacity: 0.06;

    /* Parallax Blur Amounts */
    --parallax-blur-bg: 100px;
    --parallax-blur-mid: 60px;
    --parallax-blur-fg: 35px;
  }
```

- [ ] **Step 2: Replace the entire `.dark` block**

In `src/index.css`, replace the entire `.dark { ... }` block (lines 108–171) with:

```css
  .dark {
    /* ============================================
       DARK MODE — Warm Espresso + Icon Gold
       Derived from the Divit icon palette
       ============================================ */

    --background: 30 20% 9%;
    --foreground: 38 30% 90%;

    --card: 30 22% 11%;
    --card-foreground: 38 30% 90%;

    --popover: 30 22% 11%;
    --popover-foreground: 38 30% 90%;

    --surface-elevated: 30 20% 13%;

    /* Primary - Icon gold */
    --primary: 42 60% 55%;
    --primary-foreground: 30 20% 9%;
    --primary-glow: 42 65% 68%;

    /* Secondary - Elevated warm panel */
    --secondary: 30 18% 16%;
    --secondary-foreground: 38 25% 80%;

    /* Muted - Subtle warm background */
    --muted: 30 18% 14%;
    --muted-foreground: 35 20% 55%;

    /* Accent - Deeper gold for hover/active */
    --accent: 42 50% 45%;
    --accent-foreground: 38 30% 90%;

    /* Success - Warm green */
    --success: 158 50% 45%;
    --success-foreground: 30 20% 9%;

    /* Info - Blue */
    --info: 206 70% 60%;
    --info-foreground: 30 20% 9%;

    /* Warning - Amber */
    --warning: 38 88% 55%;
    --warning-foreground: 30 20% 9%;

    /* Destructive - Red */
    --destructive: 4 68% 55%;
    --destructive-foreground: 38 30% 90%;

    /* Borders - Warm dark */
    --border: 33 25% 18%;
    --input: 33 25% 18%;
    --ring: 42 60% 55%;

    /* Gradients */
    --gradient-hero: linear-gradient(135deg, hsl(42, 65%, 45%) 0%, hsl(33, 40%, 25%) 50%, hsl(30, 20%, 9%) 100%);
    --gradient-subtle: linear-gradient(180deg, hsl(30, 20%, 9%) 0%, hsl(30, 20%, 11%) 100%);

    /* Shadows */
    --shadow-soft: 0 2px 12px -2px hsl(0 0% 0% / 0.30);
    --shadow-medium: 0 4px 20px -4px hsl(0 0% 0% / 0.40);
    --shadow-strong: 0 8px 32px -8px hsl(0 0% 0% / 0.50);

    /* Parallax Gradient Colors - Warm Gold tones for dark */
    --gradient-cyan-primary: 42 60% 55%;
    --gradient-cyan-bright: 42 65% 68%;
    --gradient-teal: 35 50% 45%;
    --gradient-blue: 30 40% 35%;
    --gradient-coral: 38 70% 55%;
    --gradient-pink: 42 55% 45%;
    --gradient-purple: 35 45% 40%;
    --gradient-amber: 38 88% 55%;

    /* Parallax Layer Opacities */
    --parallax-bg-opacity: 0.12;
    --parallax-mid-opacity: 0.18;
    --parallax-fg-opacity: 0.10;

    /* Parallax Blur Amounts */
    --parallax-blur-bg: 100px;
    --parallax-blur-mid: 60px;
    --parallax-blur-fg: 35px;
  }
```

- [ ] **Step 3: Start the dev server and visually check the dark theme**

Run: `npm run dev`

Open http://localhost:8080 and verify:
- Background is warm espresso (dark warm brown, not blue-black)
- Primary buttons/accents are gold, not indigo
- Text is warm off-white, not cool gray
- The overall feel matches the icon's espresso + gold aesthetic

---

### Task 4: Add theme toggle to ProfileSettingsCard

**Files:**
- Modify: `src/components/profile/ProfileSettingsCard.tsx`

- [ ] **Step 1: Add imports**

At the top of `src/components/profile/ProfileSettingsCard.tsx`, add to the existing import block:

```tsx
import { Sun, Moon } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { useTheme } from '@/contexts/ThemeContext';
```

- [ ] **Step 2: Add useTheme hook call**

Inside the `ProfileSettingsCard` function body, after the existing hook calls, add:

```tsx
const { theme, toggleTheme } = useTheme();
```

- [ ] **Step 3: Add the toggle row to the JSX**

In the JSX, add the following block inside `<div className="space-y-4">`, after the Venmo ID section (after the closing `</div>` of the venmo space-y-2 div, before the `{isEditing && ...}` block):

```tsx
<div className="flex items-center justify-between py-1">
  <Label className="text-sm md:text-base">Appearance</Label>
  <div className="flex items-center gap-2">
    <Sun className="w-4 h-4 text-muted-foreground" />
    <Switch
      checked={theme === 'dark'}
      onCheckedChange={toggleTheme}
      aria-label="Toggle dark mode"
    />
    <Moon className="w-4 h-4 text-muted-foreground" />
  </div>
</div>
```

- [ ] **Step 4: Verify the toggle works**

With the dev server running at http://localhost:8080:
1. Navigate to Settings → Profile tab
2. Confirm the Appearance toggle row is visible with Sun/Moon icons
3. Toggle it — app switches to light mode (warm cream background, rich gold accents)
4. Toggle back — returns to dark mode (espresso background, gold accents)
5. Refresh the page — theme persists (stays on whichever mode you last selected)
6. Clear localStorage and refresh — defaults back to dark mode
