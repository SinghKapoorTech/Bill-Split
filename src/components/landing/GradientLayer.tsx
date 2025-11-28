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
        willChange: "transform",
        transform: "translateZ(0)",
        backfaceVisibility: "hidden",
      }}
      animate={{
        x: [0, 30, -20, 0],
        y: [0, -20, 10, 0],
      }}
      transition={{
        duration: 25,
        repeat: Infinity,
        ease: "easeInOut",
      }}
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
            transform: "translate(-50%, -50%)",
            pointerEvents: "none",
          }}
        />
      ))}
    </motion.div>
  );
}
