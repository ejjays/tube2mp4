import React from 'react';
import { cn } from '../../lib/utils';

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  glowEffect?: boolean;
  children: React.ReactNode;
}

const GlassCard = React.forwardRef<HTMLDivElement, GlassCardProps>(
  ({ className, glowEffect = true, children, ...props }, ref) => {
    return (
      <div className="relative h-full group">
        {glowEffect && (
          <div className="absolute -inset-2 rounded-[2.5rem] bg-gradient-to-br from-cyan-500/10 via-blue-500/10 to-purple-500/10 blur-2xl opacity-40 group-hover:opacity-80 transition-opacity duration-700" />
        )}

        <div
          ref={ref}
          className={cn(
            'relative h-full rounded-[2.5rem] border border-white/10',
            'bg-white/[0.03] backdrop-blur-xl overflow-hidden',
            'shadow-[0_20px_50px_rgba(0,0,0,0.2)]',

            'before:absolute before:inset-0 before:rounded-[2.5rem]',
            'before:bg-gradient-to-br before:from-white/10 before:via-transparent before:to-transparent before:pointer-events-none',

            'after:absolute after:inset-[1px] after:rounded-[calc(2.5rem-1px)]',
            'after:shadow-[inset_0_1px_1px_rgba(255,255,255,0.2),inset_0_-1px_1px_rgba(0,0,0,0.1)] after:pointer-events-none',

            className
          )}
          {...props}
        >
          <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-black brightness-100 contrast-150" />

          <div className="absolute top-0 left-10 right-10 h-px bg-gradient-to-r from-transparent via-white/50 to-transparent blur-[0.5px]" />

          <div className="relative z-10 h-full">{children}</div>
        </div>
      </div>
    );
  }
);
GlassCard.displayName = 'GlassCard';

export { GlassCard };
