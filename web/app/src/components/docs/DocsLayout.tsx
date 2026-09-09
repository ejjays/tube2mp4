import React from 'react';
import DocsSidebar from './DocsSidebar';
import TwinkleStars from '../ui/TwinkleStars';
import ShootingStars from '../ui/ShootingStars';

interface DocsLayoutProps {
  children: React.ReactNode;
}

const DocsLayout = ({ children }: DocsLayoutProps) => {
  return (
    <div className="fixed inset-0 flex w-full bg-[#030014] overflow-hidden selection:bg-cyan-500/30 selection:text-cyan-200">
      <div className="absolute inset-0 z-0 pointer-events-none">
        <TwinkleStars showBackground={false} />
        <ShootingStars />
      </div>

      <DocsSidebar />

      <main className="flex-1 lg:pl-72 h-full relative z-10 overflow-y-auto px-6 py-12 md:px-12 md:py-16">
        <div className="max-w-4xl mx-auto">{children}</div>
      </main>
    </div>
  );
};

export default DocsLayout;
