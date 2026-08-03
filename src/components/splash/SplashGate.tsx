// src/components/splash/SplashGate.tsx
import { useState, type ReactNode } from "react";
import { Capacitor } from "@capacitor/core";
import { BrandSplash } from "./BrandSplash";

interface SplashGateProps {
  children: ReactNode;
}

/**
 * Gates `children` behind the brand splash on native platforms only.
 * Wraps the whole app (not just routes) so providers/auth listeners don't
 * start mounting until the studio ident has finished.
 */
export function SplashGate({ children }: SplashGateProps) {
  const [showSplash, setShowSplash] = useState(() => Capacitor.isNativePlatform());

  if (showSplash) {
    return <BrandSplash onDone={() => setShowSplash(false)} />;
  }

  return <>{children}</>;
}
