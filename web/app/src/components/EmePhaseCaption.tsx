import { useState, useEffect } from 'react';

const captionFor = (phase: 'download' | 'mux', progress: number): string => {
  if (phase === 'mux') return 'finalizing — confirm the save prompt';
  if (progress > 0) return 'downloading on your device — please wait';
  return 'decrypting secure stream — bypassing throttle';
};

interface EmePhaseCaptionProps {
  phase: 'download' | 'mux';
  progress: number;
}

const EmePhaseCaption = ({ phase, progress }: EmePhaseCaptionProps) => {
  const text = captionFor(phase, progress);
  const [shown, setShown] = useState('');

  useEffect(() => {
    setShown('');
    let index = 0;
    const interval = setInterval(() => {
      index++;
      setShown(text.slice(0, index));
      if (index >= text.length) clearInterval(interval);
    }, 24);
    return () => clearInterval(interval);
  }, [text]);

  return (
    <div className="mt-2 text-[10px] text-purple-300/80 font-mono tracking-wide lowercase">
      <span className="text-purple-400/60">$ </span>
      {shown}
      <span className="inline-block w-1 h-2.5 bg-purple-400/70 ml-0.5 align-middle animate-pulse" />
    </div>
  );
};

export default EmePhaseCaption;
