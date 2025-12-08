import { useMotionValue } from "framer-motion";
import { useEffect, useState, useCallback } from "react";
import { GradientLayer } from "./GradientLayer";
import { desktopConfig, tabletConfig, mobileConfig } from "@/config/gradientBlobs";
import { ParallaxConfig } from "@/types/gradient.types";

export function ParallaxGradientBackground() {
  const [config, setConfig] = useState<ParallaxConfig>(desktopConfig);
  const [isMobile, setIsMobile] = useState(false);

  // Static position (no scroll movement)
  const staticY = useMotionValue(0);

  // Detect reduced motion preference
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Debounced resize handler for better performance
  const debounce = <T extends (...args: any[]) => void>(
    func: T,
    wait: number
  ): ((...args: Parameters<T>) => void) => {
    let timeout: NodeJS.Timeout;
    return (...args: Parameters<T>) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), wait);
    };
  };

  // Update config and mobile state
  const updateConfig = useCallback(() => {
    const width = window.innerWidth;
    const mobile = width < 768;
    setIsMobile(mobile);

    if (mobile) {
      setConfig(mobileConfig);
    } else if (width < 1024) {
      setConfig(tabletConfig);
    } else {
      setConfig(desktopConfig);
    }
  }, []);

  // Responsive configuration based on screen size with debouncing
  useEffect(() => {
    updateConfig();
    const debouncedUpdate = debounce(updateConfig, 150);
    window.addEventListener("resize", debouncedUpdate);
    return () => window.removeEventListener("resize", debouncedUpdate);
  }, [updateConfig]);

  // Static fallback for reduced motion or mobile
  if (prefersReducedMotion || isMobile) {
    return (
      <div className="fixed inset-0 w-full h-full -z-10 overflow-hidden">
        <div
          className="absolute inset-0 w-full h-full"
          style={{
            background:
              "radial-gradient(circle at 20% 20%, hsla(202, 80%, 62%, 0.12) 0%, transparent 50%), " +
              "radial-gradient(circle at 80% 30%, hsla(270, 70%, 65%, 0.12) 0%, transparent 50%), " +
              "radial-gradient(circle at 40% 80%, hsla(12, 100%, 50%, 0.15) 0%, transparent 50%)",
          }}
        />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 w-full h-full -z-10 overflow-hidden">
      <GradientLayer config={config.background} scrollY={staticY} />
      <GradientLayer config={config.midground} scrollY={staticY} />
      {config.foreground.blobs.length > 0 && (
        <GradientLayer config={config.foreground} scrollY={staticY} />
      )}
    </div>
  );
}
