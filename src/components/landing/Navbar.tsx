import React, { useState, useEffect } from 'react';
import { Menu, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getAppUrl } from '../../lib/domains';

export const Navbar = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinks = [
    { name: 'Features', href: '#features' },
    { name: 'How It Works', href: '#workflow' },
    { name: 'Testimonials', href: '#testimonials' },
    { name: 'Pricing', href: '#pricing' },
  ];

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-200 bg-white border-b border-swiss-gray-border pt-2`}
      style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 8px)' }}
    >
      <div className={`container mx-auto px-6 flex items-center justify-between max-w-[1200px] ${isScrolled ? 'h-14' : 'h-16'}`}>
        {/* Logo */}
        <a href="#" className="flex items-center gap-2 z-50">
          <img src="/billdora-logo.png" alt="Billdora" className="h-10" />
        </a>

        {/* Desktop Links */}
        <div className="hidden md:flex items-center gap-12">
          {navLinks.map((link) => (
            <a
              key={link.name}
              href={link.href}
              className="text-sm font-bold uppercase tracking-wider transition-colors relative group" style={{ color: '#474747' }}
            >
              {link.name}
              <span className="absolute -bottom-1 left-0 w-0 h-[2px] bg-swiss-black transition-all duration-300 group-hover:w-full"></span>
            </a>
          ))}
          <a
            href={getAppUrl('/login')}
            className="text-sm font-bold uppercase tracking-wider text-white px-6 py-3 rounded-lg transition-all hover:opacity-90"
            style={{ backgroundColor: '#476E66' }}
          >
            Log In
          </a>
        </div>

        {/* Mobile Menu Toggle */}
        <button
          className="md:hidden z-50 text-swiss-black p-2 -mr-2 rounded-lg active:bg-neutral-100"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          {mobileMenuOpen ? <X size={28} /> : <Menu size={28} />}
        </button>

        {/* Mobile Menu */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
              className="absolute top-0 left-0 w-full bg-white border-b border-neutral-200 px-5 pb-4 md:hidden flex flex-col gap-1"
              style={{
                paddingTop: 'calc(env(safe-area-inset-top, 0px) + 60px)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
              }}
            >
              {navLinks.map((link) => (
                <a
                  key={link.name}
                  href={link.href}
                  className="text-sm font-semibold uppercase tracking-wide text-neutral-700 py-2.5 px-2 rounded-lg hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {link.name}
                </a>
              ))}
              <a
                href={getAppUrl('/login')}
                className="text-center text-sm font-semibold uppercase tracking-wide text-white py-2.5 rounded-lg mt-2"
                style={{ backgroundColor: '#476E66' }}
                onClick={() => setMobileMenuOpen(false)}
              >
                Log In
              </a>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </nav>
  );
};
