import { motion } from 'framer-motion';
import { PersonTotal } from '@/types';
import { AnimatedCounter } from '@/components/ui/AnimatedCounter';

interface SplitDonutChartProps {
  personTotals: PersonTotal[];
  total: number;
  size?: number;
}

const COLORS = [
  'hsl(234, 62%, 52%)',  // primary indigo
  'hsl(158, 64%, 40%)',  // success emerald
  'hsl(262, 52%, 58%)',  // accent violet
  'hsl(38, 92%, 50%)',   // warning amber
  'hsl(206, 85%, 55%)',  // info sky
  'hsl(330, 80%, 55%)',  // pink
  'hsl(175, 65%, 45%)',  // teal
  'hsl(12, 85%, 55%)',   // coral
];

/**
 * SplitDonutChart - Animated SVG donut chart showing each person's share of the bill.
 * Segments animate in sequentially with staggered delays.
 */
export function SplitDonutChart({ personTotals, total, size = 160 }: SplitDonutChartProps) {
  if (total <= 0 || personTotals.length === 0) return null;

  const strokeWidth = 18;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  let cumulativeOffset = 0;

  return (
    <div className="flex flex-col items-center gap-3 py-4">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {/* Background circle */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="hsl(var(--muted))"
            strokeWidth={strokeWidth}
          />

          {/* Animated segments */}
          {personTotals.map((pt, index) => {
            const proportion = pt.total / total;
            const segmentLength = circumference * proportion;
            const offset = cumulativeOffset;
            cumulativeOffset += segmentLength;
            const color = COLORS[index % COLORS.length];

            return (
              <motion.circle
                key={pt.personId}
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke={color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeDasharray={`${segmentLength} ${circumference - segmentLength}`}
                strokeDashoffset={-offset}
                transform={`rotate(-90 ${center} ${center})`}
                initial={{ strokeDasharray: `0 ${circumference}` }}
                animate={{ strokeDasharray: `${segmentLength} ${circumference - segmentLength}` }}
                transition={{
                  duration: 0.6,
                  delay: index * 0.15,
                  ease: [0.4, 0, 0.2, 1],
                }}
              />
            );
          })}
        </svg>

        {/* Center total */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xs text-muted-foreground">Total</span>
          <AnimatedCounter
            value={total}
            prefix="$"
            decimals={2}
            className="text-lg font-bold text-foreground"
          />
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
        {personTotals.map((pt, index) => (
          <div key={pt.personId} className="flex items-center gap-1.5">
            <div
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: COLORS[index % COLORS.length] }}
            />
            <span className="text-xs text-muted-foreground">{pt.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
