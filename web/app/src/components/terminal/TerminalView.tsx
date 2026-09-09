import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal, Activity, Monitor, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import LogLine from './LogLine';
import EmePhaseCaption from '../EmePhaseCaption';
import { formatSize } from '../../lib/utils';

interface LogData {
  id?: string;
  timestamp: string;
  type: string;
  text: string;
}

interface TerminalViewProps {
  isVisible: boolean;
  progress: number;
  statusText?: string;
  displayLogs: LogData[];
  showSuccess?: boolean;
  getTimestamp: () => string;
  scrollRef: React.RefObject<HTMLDivElement>;
  handleScroll?: (e: React.UIEvent<HTMLDivElement>) => void;
  error?: string;
  isPickerOpen?: boolean;
  emePhase?: 'download' | 'mux' | null;
  emeProgress?: number;
  emeBytes?: { received: number; total: number } | null;
  onCancel?: () => void;
}

const TerminalWindowDecorations = () => (
  <>
    <div className="absolute inset-0 pointer-events-none z-50 opacity-[0.02] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,2px_100%]" />
    <div className="flex items-center gap-3 px-5 py-3 border-b border-cyan-500/20 bg-white/5 shrink-0">
      <div className="flex gap-1.5">
        <div className="w-2.5 h-2.5 rounded-full bg-red-500/30 border border-red-500/20" />
        <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/30 border border-yellow-500/20" />
        <div className="w-2.5 h-2.5 rounded-full bg-green-500/30 border border-green-500/20" />
      </div>
      <div className="flex-1 flex items-center justify-center gap-2">
        <Monitor size={12} className="text-cyan-400/40" />
        <span className="text-[10px] text-cyan-400/50 font-mono uppercase tracking-[0.2em] font-bold">
          Terminal — root@phantom
        </span>
      </div>
      <div className="w-12" />
    </div>
  </>
);

const MonitorContent = ({ progress }: { progress: number }) => (
  <div className="relative z-20 mb-8 shrink-0">
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-3">
        <Terminal size={18} className="text-cyan-400" />
        <span className="text-[11px] text-cyan-400 font-black uppercase tracking-[0.3em]">
          SYSTEM_MONITOR
        </span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-xl font-mono font-bold text-cyan-400">
          {String(Math.floor(progress || 0))}
        </span>
        <span className="text-[10px] text-cyan-500/50 font-mono">%</span>
      </div>
    </div>
    <div className="h-1.5 w-full bg-cyan-500/10 rounded-full overflow-hidden p-[0.5px] border border-cyan-500/10">
      <motion.div
        className="h-full bg-cyan-500 shadow-[0_0_15px_#22d3ee] rounded-full"
        initial={{ width: 0 }}
        animate={{ width: `${progress || 0}%` }}
        transition={{
          type: 'spring',
          stiffness: 40,
          damping: 15,
          mass: 0.5,
        }}
      />
    </div>
  </div>
);

const EmeMonitorBar = ({
  progress,
  phase,
  onCancel,
}: {
  progress: number;
  phase: 'download' | 'mux';
  onCancel?: () => void;
}) => (
  <div className="relative z-20 mb-8 shrink-0 -mt-4">
    <div className="flex items-center justify-between mb-2">
      <span className="text-[10px] text-purple-300 font-black uppercase tracking-[0.3em]">
        ⚡ ON-DEVICE_{phase === 'mux' ? 'MUXING' : 'DOWNLOAD'}
      </span>
      <span className="flex items-center gap-2">
        <span className="text-[10px] font-mono text-purple-300">
          {String(Math.floor(progress || 0))}%
        </span>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            aria-label="Abort on-device processing"
            className="-my-1 -mr-1 p-1 text-purple-300/50 hover:text-red-300 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </span>
    </div>
    <div className="h-1.5 w-full bg-purple-500/10 rounded-full overflow-hidden p-[0.5px] border border-purple-500/20">
      <motion.div
        className="h-full bg-gradient-to-r from-purple-600 to-fuchsia-500 shadow-[0_0_15px_#a855f7] rounded-full"
        initial={{ width: 0 }}
        animate={{ width: `${progress || 0}%` }}
        transition={{ type: 'spring', stiffness: 40, damping: 15, mass: 0.5 }}
      />
    </div>
    <EmePhaseCaption phase={phase} progress={progress} />
  </div>
);

const StatusArea = ({
  statusText,
  error,
}: {
  statusText?: string;
  error?: string;
}) => (
  <div className="mb-8 shrink-0">
    <div className="text-[9px] text-cyan-400/30 uppercase tracking-[0.5em] font-black mb-2">
      CURRENT_OPERATION
    </div>
    <div
      className={`inline-block px-4 py-1.5 rounded-lg bg-cyan-500/5 border ${error ? 'border-red-500/40 text-red-400' : 'border-cyan-500/10 text-white/90'} text-[11px] font-mono tracking-widest uppercase`}
    >
      {statusText}
    </div>
  </div>
);

const TechnicalHeader = () => (
  <div className="flex items-center gap-3 mb-5 border-b border-cyan-500/10 pb-3 shrink-0 relative z-20">
    <Activity size={14} className="text-cyan-500/60" />
    <span className="text-[10px] text-cyan-400/40 uppercase tracking-[0.3em] font-black">
      TECHNICAL_STREAM
    </span>
  </div>
);

const TerminalFooter = () => (
  <div className="mt-8 pt-5 border-t border-cyan-500/10 shrink-0">
    <div className="flex justify-between items-center opacity-40">
      <div className="text-[9px] text-cyan-400 font-black uppercase tracking-[0.3em] italic">
        PHANTOM_V1
      </div>
      <div className="flex gap-2">
        {[...Array(3)].map((_, i) => (
          <motion.div
            // eslint-disable-next-line react/no-array-index-key
            key={i}
            animate={{
              opacity: [0.3, 1, 0.3],
              scale: [0.8, 1, 0.8],
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              delay: i * 0.3,
            }}
            className="w-1 h-1 bg-cyan-500 rounded-full shadow-[0_0_5px_#22d3ee]"
          />
        ))}
      </div>
    </div>
  </div>
);

const TerminalWindow = ({
  children,
  isPickerOpen,
}: {
  children: React.ReactNode;
  isPickerOpen: boolean;
}) => (
  <motion.div
    initial={{ opacity: 0, x: -50 }}
    animate={{
      opacity: 1,
      x: isPickerOpen ? 'calc(25vw - 140px - 50%)' : 0,
      scale: isPickerOpen ? 0.85 : 1,
      originX: 0.5,
      originY: 0.5,
    }}
    exit={{ opacity: 0, x: -50 }}
    transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
    style={{ left: isPickerOpen ? '0' : '2rem' }}
    className="hidden lg:flex fixed top-0 bottom-0 w-[calc(50vw-280px)] max-w-[420px] min-w-[320px] z-[2000000] flex-col justify-start pt-6 pointer-events-none"
  >
    <div className="h-[88vh] relative bg-black/20 backdrop-blur-3xl border border-cyan-500/30 rounded-[2rem] shadow-[0_0_50px_rgba(6,182,212,0.15)] overflow-hidden flex flex-col pointer-events-auto">
      <TerminalWindowDecorations />
      {children}
    </div>
  </motion.div>
);

const useRevealQueue = (total: number, intervalMs: number): number => {
  const [revealed, setRevealed] = useState(0);
  useEffect(() => {
    if (revealed > total) {
      setRevealed(total);
      return undefined;
    }
    if (revealed >= total) return undefined;
    const timer = setTimeout(
      () => setRevealed((prev) => Math.min(prev + 1, total)),
      intervalMs
    );
    return () => clearTimeout(timer);
  }, [revealed, total, intervalMs]);
  return revealed;
};

const LogStream = ({ displayLogs }: { displayLogs: LogData[] }) => {
  const revealed = useRevealQueue(displayLogs.length, 220);
  return (
    <div className="flex flex-col gap-4">
      {displayLogs.slice(0, revealed).map((log) => (
        <LogLine key={log.id || `${log.timestamp}-${log.text}`} log={log} />
      ))}
    </div>
  );
};

const LogDisplay = ({
  showSuccess,
  displayLogs,
  scrollRef,
  handleScroll,
}: {
  showSuccess: boolean;
  displayLogs: LogData[];
  scrollRef: React.RefObject<HTMLDivElement>;
  handleScroll: (e: React.UIEvent<HTMLDivElement>) => void;
}) => (
  <div
    ref={scrollRef}
    onScroll={handleScroll}
    className="flex-1 overflow-y-auto pr-2 flex flex-col gap-4 font-mono scroll-smooth relative z-0 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-cyan-500/20 hover:scrollbar-thumb-cyan-500/40"
  >
    {showSuccess ? (
      <motion.div
        key="success-view"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-4"
      >
        <LogLine
          log={{
            timestamp: '',
            text: 'Successfully Sent to Device',
            type: 'success',
          }}
          isTyping={false}
        />
        <LogLine
          log={{
            timestamp: '',
            text: 'Successfully processed. Check your downloads to find your file.',
            type: 'info',
          }}
          isTyping
        />
      </motion.div>
    ) : (
      <LogStream displayLogs={displayLogs} />
    )}
    {!showSuccess && displayLogs.length === 0 && (
      <div className="text-[11px] text-cyan-500/10 animate-pulse tracking-widest font-black uppercase">
        WAITING_FOR_UPLINK...
      </div>
    )}
  </div>
);

const TerminalView = ({
  isVisible,
  progress,
  statusText,
  displayLogs,
  showSuccess,
  scrollRef,
  handleScroll,
  error,
  isPickerOpen,
  emePhase,
  emeProgress,
  emeBytes,
  onCancel,
}: TerminalViewProps) => {
  const terminalContent = (
    <AnimatePresence>
      {isVisible && (
        <TerminalWindow isPickerOpen={!!isPickerOpen}>
          <div className="flex-1 p-8 flex flex-col overflow-hidden relative">
            <MonitorContent progress={progress} />
            {emePhase != null && (
              <EmeMonitorBar
                progress={emeProgress ?? 0}
                phase={emePhase}
                onCancel={onCancel}
              />
            )}
            {emePhase === 'download' && emeBytes && emeBytes.total > 0 && (
              <div className="relative z-20 -mt-4 mb-6 shrink-0 font-mono text-[10px] tracking-wider text-purple-300/70">
                {formatSize(emeBytes.received)} / {formatSize(emeBytes.total)}
              </div>
            )}
            <StatusArea statusText={statusText} error={error} />
            <div className="flex-1 min-h-0 flex flex-col relative">
              <TechnicalHeader />
              <LogDisplay
                showSuccess={!!showSuccess}
                displayLogs={displayLogs}
                scrollRef={scrollRef}
                handleScroll={handleScroll || (() => {})}
              />
            </div>
            <TerminalFooter />
          </div>
        </TerminalWindow>
      )}
    </AnimatePresence>
  );

  return createPortal(terminalContent, document.body);
};

export default TerminalView;
