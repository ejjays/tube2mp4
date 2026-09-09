import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';

interface SupportedServicesProps {
  isOpen: boolean;
  onClose: () => void;
}

const SupportedServices = ({ isOpen, onClose }: SupportedServicesProps) => {
  const supported = [
    'YouTube',
    'Spotify',
    'Facebook',
    'Instagram',
    'TikTok',
    'X (twitter)',
    'Reddit',
  ];

  const modalContent = (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 flex justify-center z-[10000]">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.8 }}
            exit={{ opacity: 0 }}
            className="absolute bg-black/90 backdrop-blur-sm inset-0"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: 'spring', duration: 0.4, bounce: 0.3 }}
            className="relative w-11/12 md:max-w-lg h-fit bg-gray-900 rounded-xl mt-12 shadow-[0_0_15px_rgba(0,255,255,0.2)] p-2 flex flex-col gap-3 border border-white/10"
          >
            <div className="flex flex-wrap">
              {supported.map((services) => (
                <span
                  key={services}
                  className="bg-gray-800 rounded-full text-cyan-300 m-1 p-1 px-3 whitespace-nowrap h-fit text-sm font-semibold border border-cyan-500/20"
                >
                  {services}
                </span>
              ))}
            </div>
            <p className="text-[10px] md:text-sm text-gray-500 font-mono px-1 leading-relaxed border-t border-white/5 pt-2">
              supporting your favorite platforms for easy downloading, always
              working to add more services soon!
            </p>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  return createPortal(modalContent, document.body);
};

export default SupportedServices;
