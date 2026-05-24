import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';

export function LandingFooter() {
  return (
    <motion.footer
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6 }}
      className="bg-stone-900 text-stone-100 py-8 px-8 relative overflow-hidden"
    >
      <div className="container mx-auto max-w-7xl px-4 md:px-8 relative z-10">
        <div className="flex flex-col md:flex-row justify-between items-center gap-8">
          {/* Logo and tagline */}
          <div className="flex flex-col items-center md:items-start gap-2">
            <div className="flex items-center gap-2">
              <img src="/divit-icon.png" alt="Divit" className="w-8 h-8 rounded-lg" />
              <span className="text-xl font-bold text-stone-100">Divit</span>
            </div>
            <p className="text-sm text-stone-400">Making bill splitting simple and fair</p>
          </div>

          {/* Links */}
          <div className="flex gap-6 text-sm">
            <a href="#" className="hover:text-amber-400 transition-colors">About</a>
            <a href="#" className="hover:text-amber-400 transition-colors">Features</a>
            <a href="#" className="hover:text-amber-400 transition-colors">Contact</a>
            <Link to="/privacy" className="hover:text-amber-400 transition-colors">Privacy</Link>
          </div>
        </div>

        {/* Copyright */}
        <div className="mt-6 pt-6 border-t border-stone-800 text-center text-sm text-stone-500">
          © 2024 Divit. All rights reserved.
        </div>
      </div>
    </motion.footer>
  );
}
