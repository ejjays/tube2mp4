import { motion } from 'framer-motion';
import { X } from 'lucide-react';

interface ModalHeaderProps {
  onClose: () => void;
}

const ModalHeader = ({ onClose }: ModalHeaderProps) => (
  <motion.button
    whileTap={{ scale: 0.9 }}
    onClick={onClose}
    className="absolute top-4 right-4 z-50 p-2 bg-black/40 hover:bg-black/60 rounded-full text-white/70 hover:text-white transition-colors cursor-pointer"
  >
    <X size={20} />
  </motion.button>
);

export default ModalHeader;
