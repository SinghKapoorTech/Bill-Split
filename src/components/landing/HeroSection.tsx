import { Sparkles, Zap, Users, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

export function HeroSection() {
  const navigate = useNavigate();

  return (
    <section className="relative py-16 px-8 bg-gradient-to-b from-white via-slate-50 to-white overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 via-transparent to-blue-500/5" />
      
      {/* Decorative circles */}
      <div className="absolute top-20 left-10 w-72 h-72 bg-gradient-to-br from-cyan-400/10 to-blue-400/10 rounded-full blur-3xl" />
      <div className="absolute bottom-20 right-10 w-96 h-96 bg-gradient-to-br from-purple-400/10 to-pink-400/10 rounded-full blur-3xl" />
      
      <div className="container mx-auto max-w-7xl relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left side - Main content */}
          <div className="space-y-6">
            <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight leading-tight">
              <span className="bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500 bg-clip-text text-transparent">
                Split Bills Fairly
              </span>
              <br />
              <span className="text-slate-900">with AI</span>
            </h1>
            
            <p className="text-xl md:text-2xl text-slate-600 leading-relaxed max-w-xl">
              Upload your receipt and let AI handle the math. Perfect splits every time, 
              whether dining with friends or managing group expenses.
            </p>

            {/* Quick features */}
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2 text-slate-700">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center shadow-lg">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <span className="font-semibold">AI-Powered</span>
              </div>
              
              <div className="flex items-center gap-2 text-slate-700">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center shadow-lg">
                  <Zap className="w-5 h-5 text-white" />
                </div>
                <span className="font-semibold">Instant Results</span>
              </div>
              
              <div className="flex items-center gap-2 text-slate-700">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center shadow-lg">
                  <Users className="w-5 h-5 text-white" />
                </div>
                <span className="font-semibold">Group Friendly</span>
              </div>
            </div>

            {/* CTA */}
            <div className="flex items-center gap-4">
              <Button
                onClick={() => navigate('/auth')}
                size="lg"
                className="px-12 py-7 text-xl font-bold bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105 group"
              >
                Get Started Free
                <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Button>
            </div>
          </div>

          {/* Right side - Visual showcase */}
          <div className="hidden lg:block">
            <div className="relative">
              {/* Main card */}
              <div className="bg-white rounded-2xl shadow-2xl p-8 border border-slate-200">
                <div className="space-y-6">
                  {/* Mock receipt header */}
                  <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center">
                        <Sparkles className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <div className="font-bold text-lg text-slate-900">AI Analysis</div>
                        <div className="text-sm text-slate-500">Instant & Accurate</div>
                      </div>
                    </div>
                    <div className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-semibold">
                      Complete
                    </div>
                  </div>

                  {/* Mock items */}
                  <div className="space-y-3">
                    {[
                      { name: 'Burger & Fries', price: '$15.99', color: 'from-cyan-500 to-blue-500' },
                      { name: 'Caesar Salad', price: '$12.50', color: 'from-blue-500 to-purple-500' },
                      { name: 'Pasta Carbonara', price: '$18.75', color: 'from-purple-500 to-pink-500' },
                    ].map((item, i) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className={`w-2 h-2 rounded-full bg-gradient-to-r ${item.color}`} />
                          <span className="font-medium text-slate-700">{item.name}</span>
                        </div>
                        <span className="font-bold text-slate-900">{item.price}</span>
                      </div>
                    ))}
                  </div>

                  {/* Mock total */}
                  <div className="pt-4 border-t border-slate-200">
                    <div className="flex items-center justify-between text-lg font-bold">
                      <span className="text-slate-700">Total</span>
                      <span className="bg-gradient-to-r from-cyan-500 to-blue-500 bg-clip-text text-transparent">
                        $47.24
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Floating badge */}
              <div className="absolute -top-4 -right-4 bg-gradient-to-r from-cyan-500 to-blue-500 text-white px-6 py-3 rounded-full shadow-xl font-bold text-sm">
                ⚡ Powered by AI
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
