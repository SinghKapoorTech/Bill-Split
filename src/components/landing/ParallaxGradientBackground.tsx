import { useMotionValue } from "framer-motion";
import { useEffect, useState } from "react";
import { GradientLayer } from "./GradientLayer";
import { desktopConfig, tabletConfig, mobileConfig } from "@/config/gradientBlobs";
import { ParallaxConfig } from "@/types/gradient.types";

export function ParallaxGradientBackground() {
  const [config, setConfig] = useState<ParallaxConfig>(desktopConfig);

  // Static position (no scroll movement)
  const staticY = useMotionValue(0);

  // Detect reduced motion preference
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Responsive configuration based on screen size
  useEffect(() => {
    const updateConfig = () => {
      const width = window.innerWidth;
      if (width < 768) {
        setConfig(mobileConfig);
      } else if (width < 1024) {
        setConfig(tabletConfig);
      } else {
        setConfig(desktopConfig);
      }
    };

    updateConfig();
    window.addEventListener("resize", updateConfig);
    return () => window.removeEventListener("resize", updateConfig);
  }, []);

  // Static fallback for reduced motion
  if (prefersReducedMotion) {
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
