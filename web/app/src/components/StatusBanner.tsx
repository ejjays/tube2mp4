import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

interface StatusBannerProps {
  error?: string | null;
  status: string;
  loading: boolean;
}

const StatusBanner = ({ error, status, loading }: StatusBannerProps) => {
  return (
    <div className="md:hidden w-full max-w-md">
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{
              opacity: 1,
              y: 0,
              transition: { duration: 0.3, ease: 'easeOut' },
            }}
            exit={{ opacity: 0, y: 10 }}
            className="w-full mt-6 relative group"
          >
            <div className="absolute -inset-0.5 bg-gradient-to-r from-red-500 to-rose-600 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-1000"></div>
            <div className="relative flex items-center gap-4 bg-black/40 backdrop-blur-xl border border-red-500/30 p-4 rounded-2xl shadow-2xl overflow-hidden">
              <div className="relative shrink-0">
                <div className="absolute inset-0 bg-red-500 blur-lg opacity-40 animate-pulse"></div>
                <div className="relative bg-red-500/20 p-2.5 rounded-xl border border-red-500/50">
                  <AlertCircle size={22} className="text-red-400" />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-red-400 text-[10px] font-black uppercase tracking-[0.2em] mb-1">
                  System Alert
                </h4>
                <p className="text-gray-200 text-xs font-medium leading-relaxed break-words">
                  {error}
                </p>
              </div>
              <div className="absolute top-0 right-0 p-1">
                <div className="w-4 h-4 border-t-2 border-r-2 border-red-500/20 rounded-tr-lg"></div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {status === 'completed' && !loading && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{
            opacity: 1,
            y: 0,
            transition: { duration: 0.4, ease: 'easeOut' },
          }}
          className="w-full mt-6 relative group"
        >
          <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-500 to-cyan-600 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-1000"></div>
          <div className="relative flex items-center gap-4 bg-black/40 backdrop-blur-xl border border-emerald-500/30 p-4 rounded-2xl shadow-2xl overflow-hidden">
            <div className="relative shrink-0">
              <div className="absolute inset-0 bg-emerald-500 blur-lg opacity-40 animate-pulse"></div>
              <div className="relative bg-emerald-500/20 p-2.5 rounded-xl border border-emerald-500/50">
                <CheckCircle2 size={22} className="text-emerald-400" />
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <h4 className="text-emerald-400 text-[10px] font-black uppercase tracking-[0.2em] mb-1">
                Download started
              </h4>
              <p className="text-gray-200 text-xs font-medium leading-relaxed">
                Successfully sent to your device.
              </p>
            </div>

            <div className="absolute top-0 right-0 p-1">
              <div className="w-4 h-4 border-t-2 border-r-2 border-emerald-500/20 rounded-tr-lg"></div>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default StatusBanner;
