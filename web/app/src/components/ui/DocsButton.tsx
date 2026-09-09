import React from 'react';
import { motion } from 'framer-motion';
import bookIcon from '../../assets/images/book.webp';

const DocsButton = () => {
  return (
    // skipcq: JS-0415
    <a
      href="/"
      target="_blank"
      rel="noopener noreferrer"
      className="block"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        className="cursor-pointer transition-all duration-300 origin-center group"
        title="Read Technical Guide"
      >
        <div className="relative w-[42px] h-[42px] sm:w-16 sm:h-16 md:w-10 md:h-10 flex items-center justify-center">
          <div className="absolute inset-0 bg-cyan-500/20 blur-xl rounded-full scale-0 group-hover:scale-150 transition-transform duration-500 pointer-events-none"></div>

          <div className="relative">
            <motion.div
              animate={{
                y: [0, -8, 0],
                rotate: [0, 8, 0],
              }}
              transition={{
                duration: 5,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
              className="relative"
            >
              <img
                src={bookIcon}
                alt="Documentation"
                className="w-full h-full object-contain drop-shadow-[0_0_10px_rgba(6,182,212,0.3)] group-hover:drop-shadow-[0_0_20px_rgba(6,182,212,0.6)] transition-all duration-300"
              />
            </motion.div>
          </div>
        </div>
      </motion.div>
    </a>
  );
};

export default DocsButton;
