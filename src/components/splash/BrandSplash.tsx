// src/components/splash/BrandSplash.tsx
import { useEffect } from "react";
import { SplashScreen } from "@capacitor/splash-screen";
import "./BrandSplash.css";

// Type animation finishes at 490ms (line 1: 0-280ms, line 2: 340-490ms).
// Hold on the resting cursor blink for a short beat so it doesn't feel
// clipped, then hand off — ~700ms total, matching the approved design.
const TOTAL_DURATION_MS = 700;

interface BrandSplashProps {
  onDone: () => void;
}

export function BrandSplash({ onDone }: BrandSplashProps) {
  useEffect(() => {
    // Native splash is a flat color matching this component's background
    // (see capacitor.config.ts), so hiding it immediately on mount is
    // invisible — no timing guess needed for a seamless handoff.
    // Matches the .catch(console.error) convention main.tsx already uses
    // for the sibling StatusBar calls it makes right before mounting this.
    SplashScreen.hide().catch(console.error);

    const timer = setTimeout(onDone, TOTAL_DURATION_MS);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <div className="brandSplash">
      <div className="brandSplash__stack">
        <div className="brandSplash__row">
          <span className="brandSplash__type1">singh kapoor</span>
          <span className="brandSplash__cursor1" />
        </div>
        <div className="brandSplash__row">
          <span className="brandSplash__type2">tech</span>
          <span className="brandSplash__cursor2" />
        </div>
      </div>
    </div>
  );
}
