export interface GradientBlob {
  color: string;
  opacity: number;
  size: string;
  position: { x: string; y: string };
  blur: string;
}

export interface GradientLayerConfig {
  blobs: GradientBlob[];
  speed: number; // Parallax speed multiplier (0.0 - 1.0)
  zIndex: number;
}

export interface ParallaxConfig {
  background: GradientLayerConfig;
  midground: GradientLayerConfig;
  foreground: GradientLayerConfig;
}
