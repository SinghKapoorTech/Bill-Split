import { Utensils, ShoppingCart, Plane } from 'lucide-react';
import { motion } from 'framer-motion';
import { useInView } from '@/hooks/useInView';
import { useRef } from 'react';

export function UseCasesSection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(sectionRef, { threshold: 0.1, rootMargin: '100px' });

  const useCases = [
    {
      icon: Utensils,
      title: 'Restaurant Dinners',
      description: 'Split the check perfectly, even with shared appetizers and separate drinks',
      detail: 'No more awkward math at the table. Scan the receipt, assign items, and send payment requests - all in under a minute.',
      gradient: 'from-indigo-500 to-violet-500',
      iconBg: 'bg-indigo-50',
      iconColor: 'text-indigo-600',
    },
    {
      icon: ShoppingCart,
      title: 'Grocery Shopping',
      description: 'Roommates can split household items fairly without the spreadsheet headache',
      detail: 'Mixed personal and shared items? No problem. Tag items as you scan and everyone pays their fair share.',
      gradient: 'from-violet-500 to-purple-500',
      iconBg: 'bg-violet-50',
      iconColor: 'text-violet-600',
    },
    {
      icon: Plane,
      title: 'Group Trips',
      description: 'Track hotels, meals, activities - settle up once at trip\'s end',
      detail: 'Create an event for your trip and add receipts throughout. Everyone can see the running total and settle at once.',
      gradient: 'from-emerald-500 to-teal-500',
      iconBg: 'bg-emerald-50',
      iconColor: 'text-emerald-600',
    },
  ];

  return (
    <section ref={sectionRef} className="py-24 px-4 md:px-8 relative overflow-hidden">
      <div className="container mx-auto max-w-7xl relative z-10">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4">
            Perfect For Any Situation
          </h2>
          <p className="text-xl md:text-2xl text-slate-600 max-w-3xl mx-auto">
            From casual dinners to group adventures, Divit has you covered
          </p>
        </motion.div>

        {/* Use cases */}
        <div className="space-y-24">
          {useCases.map((useCase, index) => {
            const Icon = useCase.icon;
            const isEven = index % 2 === 0;

            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: isEven ? -100 : 100 }}
                animate={isInView ? { opacity: 1, x: 0 } : { opacity: 0, x: isEven ? -100 : 100 }}
                transition={{ duration: 0.7, ease: 'easeOut', delay: index * 0.2 }}
                className={`flex flex-col ${isEven ? 'lg:flex-row' : 'lg:flex-row-reverse'
                  } gap-12 items-center`}
              >
                {/* Icon/Visual side */}
                <div className="flex-1 flex items-center justify-center">
                  <div className="relative">
                    {/* Decorative gradient blob */}
                    <div
                      className={`absolute inset-0 bg-gradient-to-br ${useCase.gradient} opacity-20 blur-3xl rounded-full`}
                    />

                    {/* Icon container */}
                    <div
                      className={`relative w-48 h-48 md:w-64 md:h-64 rounded-3xl ${useCase.iconBg} flex items-center justify-center shadow-2xl`}
                    >
                      <Icon className={`w-24 h-24 md:w-32 md:h-32 ${useCase.iconColor}`} />
                    </div>
                  </div>
                </div>

                {/* Content side */}
                <div className="flex-1 space-y-4">
                  <div className={`inline-block px-4 py-2 rounded-full bg-gradient-to-r ${useCase.gradient} bg-opacity-10`}>
                    <span className="text-sm font-semibold bg-gradient-to-r ${useCase.gradient} bg-clip-text text-transparent">
                      Use Case {index + 1}
                    </span>
                  </div>

                  <h3 className="text-3xl md:text-4xl font-bold text-slate-900">
                    {useCase.title}
                  </h3>

                  <p className="text-xl md:text-2xl text-slate-700 font-medium">
                    {useCase.description}
                  </p>

                  <p className="text-lg text-slate-600 leading-relaxed">
                    {useCase.detail}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
