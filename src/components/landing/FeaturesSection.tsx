import { Camera, Calculator, Share2, Calendar, Users, CreditCard } from 'lucide-react';
import { motion } from 'framer-motion';
import { useIsMobile } from '@/hooks/use-mobile';
import { useInView } from '@/hooks/useInView';
import { useRef } from 'react';

export function FeaturesSection() {
  const isMobile = useIsMobile();
  const sectionRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(sectionRef, { threshold: 0.1, rootMargin: '100px' });

  // Adjust card size for mobile
  const cardWidth = isMobile ? 300 : 352; // Smaller cards on mobile
  const cardGap = isMobile ? 24 : 32; // Tighter gap on mobile
  const totalCardWidth = cardWidth + cardGap;

  const features = [
    {
      icon: Camera,
      title: 'AI Receipt Scanning',
      description: 'Upload any receipt and our AI automatically extracts items, prices, tax, and tip. No manual entry required.',
      gradient: 'from-cyan-500 to-blue-500',
    },
    {
      icon: Calculator,
      title: 'Fair Splitting',
      description: 'Proportional tax and tip distribution. Split items evenly or assign specific items to specific people.',
      gradient: 'from-blue-500 to-purple-500',
    },
    {
      icon: Share2,
      title: 'Shareable Links',
      description: 'Send a link to friends. No app download required.',
      gradient: 'from-purple-500 to-pink-500',
    },
    {
      icon: Calendar,
      title: 'Multi-Receipt Events',
      description: 'Create events with multiple receipts from the whole group. Perfect for trips or group activities.',
      gradient: 'from-cyan-500 to-teal-500',
    },
    {
      icon: Users,
      title: 'Save Friends & Squads',
      description: 'Save your frequent groups and friends for faster bill splitting. No more re-entering names every time.',
      gradient: 'from-teal-500 to-blue-500',
    },
    {
      icon: CreditCard,
      title: 'Payment Integration',
      description: 'Seamless Venmo integration. Send payment requests with itemized breakdowns instantly.',
      gradient: 'from-pink-500 to-rose-500',
    },
  ];

  // Duplicate features for infinite scroll effect
  const duplicatedFeatures = [...features, ...features];

  return (
    <section ref={sectionRef} className="py-24 px-4 md:px-8 relative overflow-hidden">
      <div className="container mx-auto max-w-screen-2xl relative z-10">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4">
            Everything You Need
          </h2>
          <p className="text-xl md:text-2xl text-slate-600 max-w-3xl mx-auto">
            Powerful features designed to make bill splitting effortless and fair
          </p>
        </motion.div>

        {/* Flowing slider - only animate when in view */}
        {isInView && (
          <div className="relative">
            {/* Gradient overlays for fade effect */}
            <div className="absolute left-0 top-0 bottom-0 w-20 md:w-32 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
            <div className="absolute right-0 top-0 bottom-0 w-20 md:w-32 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />

            <div className="overflow-hidden">
              <motion.div
                className="flex gap-6 md:gap-8"
                animate={{
                  x: [0, -1 * (features.length * totalCardWidth)],
                }}
                transition={{
                  x: {
                    duration: isMobile ? 25 : 30,
                    repeat: Infinity,
                    ease: "linear",
                  },
                }}
                whileHover={{ animationPlayState: "paused" }}
              >
                {duplicatedFeatures.map((feature, index) => {
                  const Icon = feature.icon;
                  return (
                    <div
                      key={index}
                      className="flex-shrink-0 w-[300px] md:w-[352px] bg-white/90 backdrop-blur-sm p-6 md:p-8 rounded-2xl border border-slate-200 shadow-lg hover:shadow-2xl transition-all duration-300 hover:-translate-y-2 group"
                    >
                      {/* Icon */}
                      <div
                        className={`w-12 h-12 md:w-16 md:h-16 rounded-xl md:rounded-2xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center mb-4 md:mb-6 shadow-lg group-hover:scale-110 transition-transform duration-300`}
                      >
                        <Icon className="w-6 h-6 md:w-8 md:h-8 text-white" />
                      </div>

                      {/* Content */}
                      <h3 className="text-lg md:text-2xl font-bold text-slate-900 mb-2 md:mb-3">
                        {feature.title}
                      </h3>
                      <p className="text-sm md:text-base text-slate-600 leading-relaxed">
                        {feature.description}
                      </p>
                    </div>
                  );
                })}
              </motion.div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
