import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router';
import { Scissors, Info, X, Sparkles } from 'lucide-react';

const menuItems = [
  {
    icon: <Scissors />,
    label: 'Audio Trimmer',
    path: '#',
    color: 'from-purple-500 to-pink-500',
    description: 'Coming Soon',
  },
  {
    icon: <Info />,
    label: 'Metadata Editor',
    path: '#',
    color: 'from-amber-500 to-orange-500',
    description: 'Coming Soon',
  },
];

const FloatingMenu = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return (
    <>
      <AnimatePresence>
        {isOpen && isMobile && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-[90]"
          />
        )}
      </AnimatePresence>

      <div className="fixed bottom-6 right-6 z-[100] flex flex-col items-end gap-4">
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="flex flex-col gap-3 mb-2"
            >
              {menuItems.map((item, idx) => (
                <motion.div
                  key={item.path}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05 }}
                >
                  <Link
                    to={item.path}
                    target={(item as { external?: boolean }).external ? '_blank' : '_self'}
                    onClick={() => {
                      if (item.path === '#') setIsOpen(false);
                    }}
                    className="group flex items-center gap-3 pr-2"
                  >
                    <span
                      className="bg-slate-900/90 backdrop-blur-md border border-white/10 px-3 py-1.5 rounded-xl text-[10px] sm:text-xs font-bold text-slate-300 opacity-0 sm:group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-xl"
                      style={{ opacity: isMobile ? 1 : undefined }}
                    >
                      {item.label}{' '}
                      {item.description && (
                        <span className="text-[9px] text-white/30 ml-1">
                          ({item.description})
                        </span>
                      )}
                    </span>
                    <div
                      className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br ${item.color} flex items-center justify-center text-slate-950 shadow-lg shadow-black/20 group-hover:scale-110 transition-transform active:scale-95`}
                    >
                      {React.cloneElement(item.icon, {
                        size: isMobile ? 18 : 20,
                      })}
                    </div>
                  </Link>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <button
          onClick={() => setIsOpen(!isOpen)}
          aria-label={isOpen ? 'Close menu' : 'Open tools menu'}
          className={`w-12 h-12 sm:w-16 sm:h-16 rounded-full flex items-center justify-center transition-all duration-500 shadow-2xl group ${
            isOpen
              ? 'bg-slate-800 text-white rotate-45'
              : 'bg-cyan-500 text-slate-950 hover:bg-cyan-400'
          }`}
        >
          <AnimatePresence mode="wait">
            {isOpen ? (
              <motion.div
                key="close"
                initial={{ rotate: -90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: 90, opacity: 0 }}
              >
                <X className="w-6 h-6 sm:w-7 sm:h-7" strokeWidth={3} />
              </motion.div>
            ) : (
              <motion.div
                key="open"
                initial={{ rotate: 90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: -90, opacity: 0 }}
                className="flex items-center justify-center"
              >
                <Sparkles className="w-6 h-6 sm:w-7 sm:h-7" strokeWidth={2.5} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* pulsing closed effect */}
          {!isOpen && (
            <div className="absolute inset-0 rounded-full bg-cyan-500 animate-ping opacity-20 pointer-events-none" />
          )}
        </button>
      </div>
    </>
  );
};

export default FloatingMenu;
