import { Receipt } from 'lucide-react';
import { motion } from 'framer-motion';

export function LandingFooter() {
  return (
    <motion.footer
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6 }}
      className="bg-slate-900 text-white py-8 px-8 relative overflow-hidden"
    >
      <div className="container mx-auto max-w-7xl px-4 md:px-8 relative z-10">
        <div className="flex flex-col md:flex-row justify-between items-center gap-8">
          {/* Logo and tagline */}
          <div className="flex flex-col items-center md:items-start gap-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center">
                <Receipt className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold text-white">ChipMates</span>
            </div>
            <p className="text-sm text-slate-400">Making bill splitting simple and fair</p>
          </div>

          {/* Links */}
          <div className="flex gap-6 text-sm">
            <a href="#" className="hover:text-cyan-400 transition-colors">About</a>
            <a href="#" className="hover:text-cyan-400 transition-colors">Features</a>
            <a href="#" className="hover:text-cyan-400 transition-colors">Contact</a>
          </div>
        </div>

        {/* Copyright */}
        <div className="mt-6 pt-6 border-t border-slate-800 text-center text-sm text-slate-500">
          © 2024 ChipMates. All rights reserved.
        </div>
      </div>
    </motion.footer>
  );
}
