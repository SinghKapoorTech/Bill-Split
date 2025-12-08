import { motion, MotionValue } from "framer-motion";
import { GradientLayerConfig } from "@/types/gradient.types";

interface GradientLayerProps {
  config: GradientLayerConfig;
  scrollY: MotionValue<number>;
}

export function GradientLayer({ config, scrollY }: GradientLayerProps) {
  return (
    <motion.div
      className="absolute inset-0 w-full h-full"
      style={{
        y: scrollY,
        zIndex: config.zIndex,
        // Optimize rendering performance
        contain: "layout style paint",
        willChange: "auto", // Only enable during actual animations
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1, ease: "easeOut" }}
    >
      {config.blobs.map((blob, index) => (
        <div
          key={`blob-${config.zIndex}-${index}`}
          className="absolute rounded-full"
          style={{
            left: blob.position.x,
            top: blob.position.y,
            width: blob.size,
            height: blob.size,
            background: `radial-gradient(circle, ${blob.color} 0%, transparent 70%)`,
            opacity: blob.opacity,
            filter: `blur(${blob.blur})`,
            transform: "translate(-50%, -50%) translateZ(0)",
            backfaceVisibility: "hidden",
            pointerEvents: "none",
          }}
        />
      ))}
    </motion.div>
  );
}
