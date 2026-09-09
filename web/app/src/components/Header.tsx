import { useState, lazy, Suspense } from 'react';
import { Plus } from 'lucide-react';
import { motion } from 'framer-motion';

const SupportedServices = lazy(() => import('./modals/SupportedServices'));

const Header = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <div
        className="flex w-full justify-center pb-4 pt-4 md:pt-6"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)' }}
      >
        <motion.header
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="flex gap-3 items-center justify-center px-3.5 py-1.5 cursor-pointer bg-white/5 backdrop-blur-md rounded-full border border-cyan-500/30 hover:border-cyan-400/60 hover:shadow-[0_0_20px_rgba(6,182,212,0.15)] transition-all duration-300 group"
          onClick={() => setIsModalOpen(true)}
        >
          <motion.div
            animate={{ rotate: isModalOpen ? 90 : 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="bg-cyan-500/20 p-1 rounded-full border border-cyan-400/30 group-hover:bg-cyan-500/30 transition-colors"
          >
            <Plus size={14} className="text-cyan-400" />
          </motion.div>
          <span className="text-xs font-medium tracking-wide text-cyan-50/90 group-hover:text-cyan-300 transition-colors">
            supported platforms
          </span>
        </motion.header>
      </div>

      <Suspense fallback={null}>
        <SupportedServices
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
        />
      </Suspense>
    </>
  );
};

export default Header;
