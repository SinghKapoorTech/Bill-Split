import { Sparkles, ArrowRight, CheckCircle2, Receipt, Share2, LayoutDashboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';

export function HeroSection() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile for performance optimization
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return (
    <section className="relative py-20 px-4 md:px-8 overflow-hidden">

      <div className="container mx-auto max-w-7xl relative z-10">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left side - Main content */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="space-y-8 text-center lg:text-left"
          >
            <div className="space-y-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-secondary text-secondary-foreground font-medium text-sm mx-auto lg:mx-0"
              >
                <Sparkles className="w-4 h-4 text-primary" />
                <span>New: AI Receipt Scanning</span>
              </motion.div>

              <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight leading-[1.1]">
                <span className="block text-foreground">Split bills fairly</span>
                <span className="bg-gradient-to-r from-amber-600 via-yellow-500 to-amber-500 bg-clip-text text-transparent">
                  in seconds
                </span>
              </h1>

              <p className="text-xl md:text-2xl text-muted-foreground leading-relaxed max-w-xl mx-auto lg:mx-0">
                The AI-powered receipt scanner that itemizes costs instantly. No math, no awkwardness.
              </p>
            </div>

            {/* CTA */}
            <div className="flex flex-col sm:flex-row items-center gap-4 justify-center lg:justify-start">
              {user ? (
                <Button
                  onClick={() => navigate('/dashboard')}
                  size="lg"
                  className="w-full sm:w-auto px-8 py-6 text-lg font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105"
                >
                  <LayoutDashboard className="mr-2 w-5 h-5" />
                  Go to Dashboard
                </Button>
              ) : (
                <Button
                  onClick={() => navigate('/auth')}
                  size="lg"
                  className="w-full sm:w-auto px-8 py-6 text-lg font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105"
                >
                  Scan a Receipt Now
                  <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
              )}
              <p className="text-sm text-muted-foreground font-medium">
                No download required for friends
              </p>
            </div>

            {/* Trust signals */}
            <div className="pt-4 flex items-center justify-center lg:justify-start gap-6 text-muted-foreground text-sm font-medium">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-success" />
                <span>Free to use</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-success" />
                <span>No hidden fees</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-success" />
                <span>Secure</span>
              </div>
            </div>
          </motion.div>

          {/* Right side - Visual showcase */}
          <div className="relative hidden lg:block h-[600px]">
            {/* The "Chaotic" Receipt */}
            <motion.div
              initial={{ rotate: -6, x: -20, opacity: 0 }}
              animate={{ rotate: -6, x: -20, opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.8 }}
              className="absolute left-0 top-10 w-72 bg-card shadow-xl border border-border p-6 rounded-sm z-10 origin-bottom-left"
              style={{ filter: 'drop-shadow(0 20px 40px rgba(0,0,0,0.1))' }}
            >
              <div className="border-b-2 border-dashed border-border pb-4 mb-4 text-center">
                <div className="font-mono font-bold text-2xl text-foreground">RECEIPT</div>
                <div className="text-xs text-muted-foreground mt-1">Order #4923</div>
              </div>
              <div className="space-y-4 font-mono text-sm text-muted-foreground mb-6 relative">
                {[
                  { name: 'Burger', price: '$15.00' },
                  { name: 'Fries', price: '$6.00' },
                  { name: 'Soda', price: '$3.00' },
                  { name: 'Salad', price: '$12.00' },
                  { name: 'Pasta', price: '$18.00' },
                  { name: 'Wine', price: '$9.00' },
                  { name: 'Cake', price: '$8.00' },
                ].map((item, i) => (
                  <div key={i} className="flex justify-between relative">
                    <span>{item.name}</span>
                    <span>{item.price}</span>
                    {/* Detection Box Animation - Only on desktop */}
                    {!isMobile && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: [0, 1, 0], scale: [0.9, 1.1, 1] }}
                        transition={{
                          duration: 2,
                          repeat: Infinity,
                          repeatDelay: 3,
                          delay: i * 0.3,
                          times: [0, 0.2, 0.8]
                        }}
                        className="absolute -inset-1 border-2 border-primary/50 rounded bg-primary/10"
                      />
                    )}
                  </div>
                ))}
              </div>
              <div className="border-t-2 border-dashed border-border pt-4">
                <div className="flex justify-between font-bold text-lg">
                  <span>TOTAL</span>
                  <span>$71.00</span>
                </div>
              </div>
            </motion.div>

            {/* The "Organized" App Interface - High Fidelity Mock */}
            <motion.div
              initial={{ x: 100, opacity: 0 }}
              animate={{ x: 40, opacity: 1 }}
              transition={{ delay: 0.6, duration: 0.8 }}
              className="absolute right-10 top-0 w-80 bg-card rounded-[2.5rem] border-[3px] border-amber-500/80 shadow-2xl overflow-hidden z-20 h-[580px] flex flex-col"
            >
              {/* App Header */}
              <div className="bg-card p-6 pb-2 border-b border-border/50">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Receipt className="w-4 h-4 text-primary" />
                    </div>
                    <span className="font-semibold text-lg">Dinner Bill</span>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Share2 className="w-4 h-4" />
                  </Button>
                </div>

                {/* Tabs */}
                <div className="flex p-1 bg-secondary rounded-lg mb-2">
                  <div className="flex-1 py-1.5 text-center text-xs font-medium bg-card rounded-md shadow-sm text-foreground">
                    Split Items
                  </div>
                  <div className="flex-1 py-1.5 text-center text-xs font-medium text-muted-foreground">
                    Review
                  </div>
                </div>
              </div>

              {/* App Content - Scrollable List */}
              <div className="flex-1 overflow-hidden relative bg-secondary/50">
                <div className="p-4 space-y-3">
                  {[
                    { name: 'Burger', price: '$15.00', assigned: ['You'], color: 'bg-amber-100 text-amber-700' },
                    { name: 'Fries', price: '$6.00', assigned: ['You', 'Sarah'], color: 'bg-yellow-100 text-yellow-700' },
                    { name: 'Soda', price: '$3.00', assigned: ['Mike'], color: 'bg-orange-100 text-orange-700' },
                    { name: 'Salad', price: '$12.00', assigned: ['Sarah'], color: 'bg-amber-50 text-amber-600' },
                    { name: 'Pasta', price: '$18.00', assigned: ['Mike'], color: 'bg-yellow-50 text-yellow-600' },
                  ].map((item, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 1.2 + (i * 0.1) }}
                      className="bg-card p-3 rounded-xl border border-border/50 shadow-sm"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-medium text-sm text-foreground">{item.name}</span>
                        <span className="font-semibold text-sm text-foreground">{item.price}</span>
                      </div>
                      <div className="flex gap-1 flex-wrap">
                        {item.assigned.map((person, j) => (
                          <span key={j} className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${item.color}`}>
                            {person}
                          </span>
                        ))}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* App Footer - Summary */}
              <div className="bg-card p-4 border-t border-border/50 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] z-10">
                <div className="space-y-2 mb-4">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Subtotal</span>
                    <span>$54.00</span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Tax & Tip</span>
                    <span>$17.00</span>
                  </div>
                </div>
                <Button className="w-full bg-primary text-primary-foreground rounded-xl py-3 text-sm font-semibold shadow-lg shadow-primary/20">
                  Send Requests
                </Button>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}

