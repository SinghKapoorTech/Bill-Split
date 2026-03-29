import { useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { MiniProgress } from '@/components/ui/pill-progress';
import { AnimatedButtonWrapper } from '@/components/ui/animated-wrappers';
import { HeroSlide } from './slides/HeroSlide';
import { BillTypesSlide } from './slides/BillTypesSlide';
import { EventsSlide } from './slides/EventsSlide';
import { SquadsSlide } from './slides/SquadsSlide';

interface OnboardingDialogProps {
  open: boolean;
  onComplete: () => void;
}

const TOTAL_SLIDES = 4;

const slideVariants = {
  enter: (direction: string) => ({
    opacity: 0,
    x: direction === 'forward' ? 50 : -50,
  }),
  center: {
    opacity: 1,
    x: 0,
  },
  exit: (direction: string) => ({
    opacity: 0,
    x: direction === 'forward' ? -50 : 50,
  }),
};

const slides = [HeroSlide, BillTypesSlide, EventsSlide, SquadsSlide];

export function OnboardingDialog({ open, onComplete }: OnboardingDialogProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [direction, setDirection] = useState('forward');

  const goNext = useCallback(() => {
    if (currentSlide < TOTAL_SLIDES - 1) {
      setDirection('forward');
      setCurrentSlide((prev) => prev + 1);
    }
  }, [currentSlide]);

  const goBack = useCallback(() => {
    if (currentSlide > 0) {
      setDirection('backward');
      setCurrentSlide((prev) => prev - 1);
    }
  }, [currentSlide]);

  const isLastSlide = currentSlide === TOTAL_SLIDES - 1;
  const CurrentSlideComponent = slides[currentSlide];

  return (
    <Dialog open={open}>
      <DialogContent
        hideCloseButton
        className="max-w-md p-0 overflow-hidden"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogTitle className="sr-only">Welcome to Divit</DialogTitle>

        {/* Skip button */}
        <button
          onClick={onComplete}
          className="absolute top-3 right-4 z-10 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Skip
        </button>

        {/* Slide content */}
        <div className="px-6 pt-10 pb-4 min-h-[340px] flex items-center justify-center">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={currentSlide}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
              className="w-full"
            >
              <CurrentSlideComponent />
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer: navigation */}
        <div className="px-6 pb-6 flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={goBack}
            className={currentSlide === 0 ? 'invisible' : ''}
          >
            Back
          </Button>

          <MiniProgress total={TOTAL_SLIDES} current={currentSlide} />

          {isLastSlide ? (
            <AnimatedButtonWrapper intensity="moderate">
              <Button
                size="sm"
                onClick={onComplete}
                className="bg-gradient-to-r from-primary to-accent text-white border-0"
              >
                Get Started
              </Button>
            </AnimatedButtonWrapper>
          ) : (
            <Button size="sm" onClick={goNext}>
              Next
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
