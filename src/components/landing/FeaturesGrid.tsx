import { Camera, Calculator, Users } from 'lucide-react';
import { Card } from '@/components/ui/card';

export function FeaturesGrid() {
  const features = [
    {
      icon: Camera,
      title: 'AI-Powered Scanning',
      description: 'Upload any receipt and our AI automatically extracts items, prices, tax, and tip. No manual entry required.',
      gradient: 'from-indigo-500 to-violet-500',
    },
    {
      icon: Calculator,
      title: 'Smart Bill Splitting',
      description: 'Assign items to people, split evenly, or customize. Get instant calculations with tax and tip automatically distributed.',
      gradient: 'from-violet-500 to-purple-500',
    },
    {
      icon: Users,
      title: 'Group Management',
      description: 'Create groups for recurring events, save your squads, and share bills in real-time with collaborative sessions.',
      gradient: 'from-purple-500 to-pink-500',
    },
  ];

  return (
    <section className="py-16 px-8 bg-white">
      <div className="container mx-auto max-w-7xl">
        {/* Section header */}
        <div className="text-center mb-12">
          <h2 className="text-5xl md:text-6xl font-bold text-slate-900 mb-4">
            Everything You Need
          </h2>
          <p className="text-xl md:text-2xl text-slate-600 max-w-3xl mx-auto">
            Powerful features designed to make bill splitting effortless and fair
          </p>
        </div>

        {/* Features grid */}
        <div className="grid md:grid-cols-3 gap-10">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <Card
                key={index}
                className="p-8 hover:shadow-2xl transition-all duration-300 hover:-translate-y-2 border-slate-200 bg-white group"
              >
                {/* Icon */}
                <div className={`w-20 h-20 rounded-2xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center mb-6 shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                  <Icon className="w-10 h-10 text-white" />
                </div>

                {/* Content */}
                <h3 className="text-2xl font-bold text-slate-900 mb-4">
                  {feature.title}
                </h3>
                <p className="text-slate-600 leading-relaxed text-lg">
                  {feature.description}
                </p>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
