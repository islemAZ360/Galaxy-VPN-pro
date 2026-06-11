'use client';

import { useState } from 'react';
import { Link } from '@/i18n/routing';
import { Menu, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type NavLink = { href: string; label: string; accent?: boolean };

export function MobileMenu({ links, signOutNode }: { links: NavLink[], signOutNode?: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="md:hidden">
      <button 
        onClick={() => setIsOpen(true)} 
        className="p-1 -mr-1 text-white hover:text-galaxy-accent transition-colors"
        aria-label="Open menu"
      >
        <Menu className="h-7 w-7" />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, x: '100%' }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-0 z-50 flex flex-col bg-galaxy-bg/95 backdrop-blur-xl p-6"
          >
            <div className="flex justify-end mb-8">
              <button 
                onClick={() => setIsOpen(false)} 
                className="p-2 -mr-2 text-white hover:text-galaxy-accent transition-colors"
              >
                <X className="h-8 w-8" />
              </button>
            </div>
            <nav className="flex flex-col gap-8 text-2xl font-medium items-center mt-12">
              {links.map((l) => (
                <Link 
                  key={l.href} 
                  href={l.href} 
                  onClick={() => setIsOpen(false)}
                  className={`transition-colors hover:text-galaxy-accent ${l.accent ? 'text-galaxy-accent' : 'text-white'}`}
                >
                  {l.label}
                </Link>
              ))}
              {signOutNode && (
                <div className="mt-8" onClick={() => setIsOpen(false)}>
                  {signOutNode}
                </div>
              )}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
