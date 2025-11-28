import { Camera, UserPlus, CreditCard, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';

export function HowItWorks() {
    const steps = [
        {
            icon: Camera,
            title: '1. Snap',
            description: 'Take a photo of any receipt (restaurants, groceries, utilities). Our AI instantly extracts every item.',
            color: 'text-cyan-500',
            bg: 'bg-cyan-50',
        },
        {
            icon: UserPlus,
            title: '2. Assign',
            description: 'Drag and drop items to friends. Split shared items evenly or by exact amounts.',
            color: 'text-blue-500',
            bg: 'bg-blue-50',
        },
        {
            icon: CreditCard,
            title: '3. Settle',
            description: 'Send a secure link. Friends can pay you back instantly via Venmo.',
            color: 'text-purple-500',
            bg: 'bg-purple-50',
        },
    ];

    return (
        <section className="py-24 px-4 md:px-8 relative overflow-hidden">
            <div className="container mx-auto max-w-7xl relative z-10">
                <div className="text-center mb-16 space-y-4">
                    <motion.h2
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-4xl md:text-5xl font-bold text-slate-900"
                    >
                        How it works
                    </motion.h2>
                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.1 }}
                        className="text-xl text-slate-600 max-w-2xl mx-auto"
                    >
                        Three simple steps to end money awkwardness forever.
                    </motion.p>
                </div>

                <div className="grid md:grid-cols-3 gap-8 relative">
                    {/* Connecting Line (Desktop) */}
                    <div className="hidden md:block absolute top-12 left-0 right-0 h-0.5 bg-gradient-to-r from-cyan-100 via-blue-100 to-purple-100 -z-10" />

                    {steps.map((step, index) => {
                        const Icon = step.icon;
                        return (
                            <motion.div
                                key={index}
                                initial={{ opacity: 0, scale: 0.5 }}
                                whileInView={{ opacity: 1, scale: 1 }}
                                viewport={{ once: true, amount: 0.3 }}
                                transition={{
                                    type: 'spring',
                                    stiffness: 100,
                                    damping: 15,
                                    delay: index * 0.2
                                }}
                                className="relative bg-white p-6 rounded-2xl border border-slate-100 shadow-lg hover:shadow-xl transition-shadow"
                            >
                                <div className={`w-16 h-16 rounded-2xl ${step.bg} ${step.color} flex items-center justify-center mb-6 text-3xl mx-auto md:mx-0`}>
                                    <Icon className="w-8 h-8" />
                                </div>

                                <h3 className="text-2xl font-bold text-slate-900 mb-3 text-center md:text-left">
                                    {step.title}
                                </h3>
                                <p className="text-slate-600 leading-relaxed text-center md:text-left">
                                    {step.description}
                                </p>

                                {/* Mobile Arrow */}
                                {index < steps.length - 1 && (
                                    <div className="md:hidden flex justify-center mt-6 text-slate-300">
                                        <ArrowRight className="w-6 h-6 rotate-90" />
                                    </div>
                                )}
                            </motion.div>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}
