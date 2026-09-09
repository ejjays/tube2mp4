import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';

interface TypingTextProps {
  text: string;
}

const TypingText = ({ text }: TypingTextProps) => {
  const [displayedText, setDisplayedText] = useState('');

  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      setDisplayedText(text.slice(0, i + 1));
      i++;
      if (i >= text.length) clearInterval(interval);
    }, 30);
    return () => clearInterval(interval);
  }, [text]);

  return <span>{displayedText}</span>;
};

interface LogData {
  timestamp: string;
  type: string;
  text: string;
}

interface LogLineProps {
  log: LogData;
  isLast?: boolean;
  isTyping?: boolean;
}

const LogLine = ({ log, isTyping = false }: LogLineProps) => {
  const getTextColor = (type: string) => {
    if (type === 'error') return 'text-red-400';
    if (type === 'success') return 'text-emerald-400';
    return 'text-cyan-400';
  };

  const getLogSymbol = (type: string) => (type === 'error' ? '!' : '>');

  return (
    <motion.div
      initial={{ opacity: 0, y: 4, filter: 'blur(4px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{
        duration: 0.5,
        ease: [0.22, 1, 0.36, 1],
      }}
      className={`flex items-start gap-3 text-[11px] leading-relaxed group/item relative ${getTextColor(log.type)}`}
    >
      {log.timestamp && (
        <span className="shrink-0 font-bold tabular-nums w-12 text-right">
          {log.timestamp}
        </span>
      )}

      <span className="shrink-0 opacity-50 group-hover/item:opacity-100 transition-opacity w-3 text-center font-black">
        {getLogSymbol(log.type)}
      </span>

      <span className="break-words tracking-tight flex-1 relative">
        {isTyping ? <TypingText text={log.text} /> : log.text}
        {isTyping && (
          <motion.span
            animate={{ opacity: [1, 0] }}
            transition={{ repeat: Infinity, duration: 0.8 }}
            className="inline-block w-1.5 h-3 bg-cyan-400/60 ml-1 translate-y-0.5"
          />
        )}
      </span>
    </motion.div>
  );
};

export default LogLine;
