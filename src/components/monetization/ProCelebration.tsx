import { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import haptics from '@/utils/haptics';
import { buildProConfetti, type ConfettiPiece } from '@/utils/proConfetti';

interface ProCelebrationProps {
  show: boolean;
  /** What Pro unlocks — the same list the paywall sold. */
  perks: string[];
  /** Optional line under the title, e.g. "Your 14-day free trial has started." */
  subtitle?: string;
  onDone: () => void;
}

/**
 * Full-screen "Welcome to Divit Pro" moment, shown once the store confirms a
 * purchase. It never auto-dismisses: the user taps "Let's go".
 *
 * Rendered through a portal: the paywall page animates in with a transform,
 * and a transformed ancestor would trap a `position: fixed` overlay inside it.
 *
 * Reduce Motion: no confetti, no springs — the same content simply fades in.
 */
export function ProCelebration({ show, perks, subtitle, onDone }: ProCelebrationProps) {
  const reducedMotion = useReducedMotion() ?? false;
  const doneRef = useRef<HTMLButtonElement>(null);
  // One exit per showing: the button stays tappable during the exit fade, and a
  // second tap would navigate back twice.
  const finishedRef = useRef(false);

  // New pieces per showing; stable while it is on screen.
  const confetti = useMemo(
    () => (show ? buildProConfetti({ reducedMotion }) : []),
    [show, reducedMotion],
  );

  useEffect(() => {
    if (!show) return;
    finishedRef.current = false;
    void haptics.success();
    doneRef.current?.focus();
  }, [show]);

  if (typeof document === 'undefined') return null;

  const spring = reducedMotion
    ? { duration: 0.2 }
    : { type: 'spring' as const, stiffness: 320, damping: 18 };

  return createPortal(
    <AnimatePresence>
      {show && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pro-celebration-title"
          className="fixed inset-0 z-[100] overflow-hidden bg-background"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          {/* Soft gold glow behind everything */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-[38%] h-[28rem] w-[28rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/25 blur-3xl"
          />

          {confetti.map((piece) => (
            <ConfettiBit key={piece.id} piece={piece} />
          ))}

          {/* Scrollable content layer: in landscape (or with large text) the
              content is taller than the screen, and "Let's go" is the only way
              out — it must never be clipped. Confetti stays on the clipped layer. */}
          <div
            className="absolute inset-0 z-10 overflow-y-auto"
            style={{
              paddingTop: 'env(safe-area-inset-top)',
              paddingBottom: 'env(safe-area-inset-bottom)',
            }}
          >
          <div className="flex min-h-full items-center justify-center px-6 py-8">
          <div className="relative flex w-full max-w-sm flex-col items-center text-center">
            <div className="relative mb-6">
              <motion.div
                className="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-[#F2C94C] to-[#C9822B] shadow-[0_0_40px_hsl(var(--primary-glow)/0.6)]"
                initial={reducedMotion ? { opacity: 0 } : { scale: 0, rotate: -30 }}
                animate={reducedMotion ? { opacity: 1 } : { scale: 1, rotate: 0 }}
                transition={spring}
              >
                <Sparkles className="h-11 w-11 text-[#2A2116]" strokeWidth={2.2} />
              </motion.div>
              {!reducedMotion && (
                <motion.div
                  aria-hidden
                  className="absolute inset-0 rounded-full border-2 border-[#F2C94C]"
                  initial={{ scale: 1, opacity: 0.9 }}
                  animate={{ scale: 1.9, opacity: 0 }}
                  transition={{ duration: 1.2, repeat: 2, ease: 'easeOut', delay: 0.2 }}
                />
              )}
            </div>

            <motion.p
              className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-primary"
              initial={{ opacity: 0, y: reducedMotion ? 0 : 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: reducedMotion ? 0 : 0.25 }}
            >
              You&rsquo;re in
            </motion.p>
            <motion.h2
              id="pro-celebration-title"
              className="text-3xl font-bold text-foreground"
              initial={{ opacity: 0, y: reducedMotion ? 0 : 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: reducedMotion ? 0 : 0.32 }}
            >
              Welcome to Divit Pro
            </motion.h2>
            {subtitle && (
              <motion.p
                className="mt-2 text-muted-foreground"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: reducedMotion ? 0 : 0.4 }}
              >
                {subtitle}
              </motion.p>
            )}

            <ul className="mt-6 w-full space-y-2 text-left">
              {perks.map((perk, i) => (
                <motion.li
                  key={perk}
                  className="flex items-center gap-3 rounded-xl border border-primary/25 bg-card/80 px-4 py-3"
                  initial={{ opacity: 0, x: reducedMotion ? 0 : -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: reducedMotion ? 0 : 0.5 + i * 0.12 }}
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20">
                    <Check className="h-4 w-4 text-primary" />
                  </span>
                  <span className="responsive-text-sm font-medium">{perk}</span>
                </motion.li>
              ))}
            </ul>

            <motion.div
              className="mt-8 w-full"
              initial={{ opacity: 0, y: reducedMotion ? 0 : 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: reducedMotion ? 0 : 0.5 + perks.length * 0.12 + 0.1 }}
            >
              <Button ref={doneRef} size="lg" className="w-full" onClick={() => {
                  if (finishedRef.current) return;
                  finishedRef.current = true;
                  onDone();
                }}>
                Let&rsquo;s go
              </Button>
            </motion.div>
          </div>
          </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function ConfettiBit({ piece }: { piece: ConfettiPiece }) {
  const shapeClass = cn(
    'pointer-events-none absolute',
    piece.shape === 'circle' && 'h-2.5 w-2.5 rounded-full',
    piece.shape === 'square' && 'h-2.5 w-2.5 rounded-[2px]',
    piece.shape === 'strip' && 'h-3.5 w-1.5 rounded-[1px]',
  );

  if (piece.kind === 'burst') {
    // Fans out from the badge (≈38% down the screen), then falls away.
    return (
      <motion.span
        aria-hidden
        className={shapeClass}
        style={{ left: '50%', top: '38%', backgroundColor: piece.color }}
        initial={{ x: 0, y: 0, opacity: 0, scale: 0.4, rotate: 0 }}
        animate={{
          x: [0, piece.x, piece.x * 1.1],
          y: [0, piece.y, piece.y + 160],
          opacity: [0, 1, 0],
          scale: [0.4, 1, 0.8],
          rotate: piece.rotate,
        }}
        transition={{
          duration: piece.duration + 0.6,
          delay: piece.delay,
          ease: 'easeOut',
          times: [0, 0.4, 1],
        }}
      />
    );
  }

  return (
    <motion.span
      aria-hidden
      className={shapeClass}
      style={{ left: `${piece.x}vw`, top: '-4vh', backgroundColor: piece.color }}
      initial={{ y: 0, x: 0, opacity: 0, rotate: 0 }}
      animate={{
        y: ['0vh', '112vh'],
        x: [0, piece.sway, -piece.sway / 2, piece.sway / 3],
        opacity: [0, 1, 1, 0],
        rotate: piece.rotate,
      }}
      transition={{ duration: piece.duration, delay: piece.delay, ease: 'linear' }}
    />
  );
}
