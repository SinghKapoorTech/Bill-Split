# ChipMates Design System

> **Last Updated**: November 21, 2024  
> **Purpose**: Central design reference for consistent UI/UX across the application

---

## Color Palette

### Primary Colors

#### Blue-Green Gradient (Brand Identity)
```css
/* Primary Gradient */
--gradient-primary: linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%);
/* Cyan to Blue */

/* Individual Colors */
--color-cyan-500: #06b6d4;    /* Vibrant cyan */
--color-cyan-600: #0891b2;    /* Deeper cyan */
--color-blue-500: #3b82f6;    /* Vibrant blue */
--color-blue-600: #2563eb;    /* Deeper blue */
```

#### Accent Colors
```css
--color-accent-purple: #8b5cf6;   /* Purple accent for highlights */
--color-accent-green: #10b981;    /* Success/positive actions */
--color-accent-amber: #f59e0b;    /* Warnings/attention */
--color-accent-rose: #f43f5e;     /* Errors/destructive actions */
```

### Neutral Colors
```css
/* Light Mode */
--color-background: #ffffff;
--color-foreground: #0f172a;      /* Slate 900 */
--color-muted: #f1f5f9;           /* Slate 100 */
--color-muted-foreground: #64748b; /* Slate 500 */
--color-border: #e2e8f0;          /* Slate 200 */

/* Dark Mode */
--color-background-dark: #0f172a;
--color-foreground-dark: #f8fafc;
--color-muted-dark: #1e293b;
--color-border-dark: #334155;
```

### Semantic Colors
```css
--color-success: #10b981;
--color-warning: #f59e0b;
--color-error: #f43f5e;
--color-info: #3b82f6;
```

---

## Typography

### Font Families
```css
--font-primary: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
--font-display: 'Inter', sans-serif;
--font-mono: 'JetBrains Mono', 'Fira Code', monospace;
```

### Font Sizes
```css
--text-xs: 0.75rem;      /* 12px */
--text-sm: 0.875rem;     /* 14px */
--text-base: 1rem;       /* 16px */
--text-lg: 1.125rem;     /* 18px */
--text-xl: 1.25rem;      /* 20px */
--text-2xl: 1.5rem;      /* 24px */
--text-3xl: 1.875rem;    /* 30px */
--text-4xl: 2.25rem;     /* 36px */
--text-5xl: 3rem;        /* 48px */
--text-6xl: 3.75rem;     /* 60px */
```

### Font Weights
```css
--font-normal: 400;
--font-medium: 500;
--font-semibold: 600;
--font-bold: 700;
--font-extrabold: 800;
```

### Line Heights
```css
--leading-tight: 1.25;
--leading-snug: 1.375;
--leading-normal: 1.5;
--leading-relaxed: 1.625;
--leading-loose: 2;
```

---

## Spacing Scale

```css
--space-1: 0.25rem;   /* 4px */
--space-2: 0.5rem;    /* 8px */
--space-3: 0.75rem;   /* 12px */
--space-4: 1rem;      /* 16px */
--space-5: 1.25rem;   /* 20px */
--space-6: 1.5rem;    /* 24px */
--space-8: 2rem;      /* 32px */
--space-10: 2.5rem;   /* 40px */
--space-12: 3rem;     /* 48px */
--space-16: 4rem;     /* 64px */
--space-20: 5rem;     /* 80px */
--space-24: 6rem;     /* 96px */
```

---

## Border Radius

```css
--radius-sm: 0.25rem;   /* 4px */
--radius-md: 0.5rem;    /* 8px */
--radius-lg: 0.75rem;   /* 12px */
--radius-xl: 1rem;      /* 16px */
--radius-2xl: 1.5rem;   /* 24px */
--radius-full: 9999px;  /* Fully rounded */
```

---

## Shadows

```css
--shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
--shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1);
--shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1);
--shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1);
--shadow-2xl: 0 25px 50px -12px rgb(0 0 0 / 0.25);

/* Colored shadows for buttons */
--shadow-primary: 0 10px 25px -5px rgba(6, 182, 212, 0.3);
--shadow-accent: 0 10px 25px -5px rgba(139, 92, 246, 0.3);
```

---

## Gradients

### Background Gradients
```css
/* Primary brand gradient */
.gradient-primary {
  background: linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%);
}

/* Subtle background gradient */
.gradient-background {
  background: linear-gradient(180deg, #ffffff 0%, #f1f5f9 100%);
}

/* Hero gradient overlay */
.gradient-hero {
  background: linear-gradient(135deg, 
    rgba(6, 182, 212, 0.1) 0%, 
    rgba(59, 130, 246, 0.1) 100%
  );
}
```

### Text Gradients
```css
.text-gradient-primary {
  background: linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.text-gradient-accent {
  background: linear-gradient(135deg, #8b5cf6 0%, #06b6d4 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
```

---

## Component Guidelines

### Buttons

#### Primary Button
- Background: Blue-green gradient
- Text: White
- Padding: 12px 24px
- Border radius: 8px
- Font weight: 600
- Hover: Slight scale (1.02) + shadow increase

#### Secondary Button
- Background: Transparent
- Border: 2px solid gradient color
- Text: Gradient text
- Padding: 12px 24px
- Hover: Background gradient with opacity

#### Ghost Button
- Background: Transparent
- Text: Muted foreground
- Hover: Background muted

### Cards
- Background: White (light mode) / Dark slate (dark mode)
- Border: 1px solid border color
- Border radius: 12px
- Padding: 24px
- Shadow: md on hover

### Input Fields
- Border: 1px solid border color
- Border radius: 8px
- Padding: 10px 16px
- Focus: Border color changes to primary gradient color

---

## Layout Guidelines

### Container Widths
```css
--container-sm: 640px;
--container-md: 768px;
--container-lg: 1024px;
--container-xl: 1280px;
--container-2xl: 1536px;
```

### Grid System
- Use CSS Grid for complex layouts
- 12-column grid for flexibility
- Gap: 24px (desktop), 16px (mobile)

### Breakpoints
```css
--breakpoint-sm: 640px;
--breakpoint-md: 768px;
--breakpoint-lg: 1024px;
--breakpoint-xl: 1280px;
--breakpoint-2xl: 1536px;
```

---

## Animation & Transitions

### Timing Functions
```css
--ease-in: cubic-bezier(0.4, 0, 1, 1);
--ease-out: cubic-bezier(0, 0, 0.2, 1);
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
--ease-bounce: cubic-bezier(0.68, -0.55, 0.265, 1.55);
```

### Duration
```css
--duration-fast: 150ms;
--duration-normal: 300ms;
--duration-slow: 500ms;
```

### Common Transitions
```css
/* Hover scale */
transition: transform 300ms ease-out;
transform: scale(1.02);

/* Fade in */
transition: opacity 300ms ease-in-out;

/* Slide up */
transition: transform 300ms ease-out;
transform: translateY(-4px);
```

---

## Accessibility

### Focus States
- Visible focus ring: 2px solid primary color
- Offset: 2px
- Never remove focus indicators

### Color Contrast
- Text on background: Minimum 4.5:1 ratio
- Large text (18px+): Minimum 3:1 ratio
- Interactive elements: Minimum 3:1 ratio

### Touch Targets
- Minimum size: 44x44px
- Spacing between targets: 8px minimum

---

## Usage Examples

### Hero Section
```tsx
<section className="bg-gradient-to-b from-white to-slate-50">
  <h1 className="text-6xl font-extrabold">
    <span className="text-gradient-primary">Split Bills</span> Fairly
  </h1>
  <button className="gradient-primary text-white px-6 py-3 rounded-lg">
    Get Started
  </button>
</section>
```

### Feature Card
```tsx
<div className="bg-white rounded-xl p-6 shadow-md hover:shadow-lg transition-shadow">
  <div className="w-12 h-12 rounded-lg gradient-primary flex items-center justify-center">
    <Icon className="text-white" />
  </div>
  <h3 className="text-xl font-semibold mt-4">Feature Title</h3>
  <p className="text-muted-foreground mt-2">Description</p>
</div>
```

---

## Notes for Future Development

1. **Consistency**: Always reference this design system when creating new components
2. **Customization**: Use CSS variables for easy theme switching
3. **Scalability**: Design system should evolve with the product
4. **Documentation**: Update this file when adding new patterns or components
5. **Testing**: Verify color contrast and accessibility for all new designs

---

**Version**: 1.0  
**Maintained by**: ChipMates Development Team
