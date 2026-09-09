import React from 'react';
import { motion } from 'framer-motion';

const SteamEffect = () => (
  <div className="absolute -top-5 left-1/2 -translate-x-1/2 flex gap-1">
    {[0, 0.8, 1.6].map((delay) => (
      <div
        key={delay}
        className="w-2 h-5 bg-white/30 rounded-full blur-[2px] animate-[rise_3s_infinite_ease-in-out]"
        style={{ animationDelay: `${delay}s` }}
      />
    ))}
  </div>
);

const SupportButton = () => {
  return (
    // skipcq: JS-0415
    <a
      href="/"
      target="_blank"
      rel="noopener noreferrer"
      className="block p-4 -m-4"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 0.6 }}
        whileHover={{ scale: 0.7 }}
        whileTap={{ scale: 0.55 }}
        className="cursor-pointer transition-all duration-300 origin-center"
        title="Support Project"
      >
        <div className="relative w-[80px] h-[80px] flex items-center justify-center">
          <div className="relative animate-[shake_3s_infinite_ease-in-out]">
            <div className="relative w-9 h-8 bg-[#5b4022]/80 border-2 border-white rounded-b-[12px] rounded-t-[2px] shadow-[0_0_15px_rgba(218,137,32,0.3)] z-10">
              <div className="absolute top-[4px] -right-[10px] w-3 h-[15px] border-2 border-white border-l-0 rounded-r-[10px] bg-transparent" />
              <SteamEffect />
            </div>
          </div>
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-[12px] font-[900] text-white uppercase tracking-widest text-shadow-[0_0_10px_rgba(6,182,212,0.5)]">
            Support
          </div>
        </div>
        <style>{`
        @keyframes rise {
          0% { transform: translateY(0) scale(0.4); opacity: 0; }
          30% { opacity: 0.5; }
          100% { transform: translateY(-50px) scale(1.2); opacity: 0; }
        }
        @keyframes shake {
          0%, 100% { transform: rotate(0); }
          25% { transform: rotate(-3deg); }
          75% { transform: rotate(3deg); }
        }
      `}</style>
      </motion.div>
    </a>
  );
};
export default SupportButton;
