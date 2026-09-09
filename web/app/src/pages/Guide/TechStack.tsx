import React, { useEffect, useRef } from 'react';
import {
  Database,
  Cpu,
  Layers,
  Terminal,
  Layout,
  Sparkles,
  Code2,
  Box,
  Binary,
  Heart,
} from 'lucide-react';
import { motion, useInView, useAnimation } from 'framer-motion';
import { GlassCard } from '../../components/ui/GlassCard';
import SEO from '../../components/utils/SEO';

const TechStack = () => {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const supportingStack = [
    {
      category: 'Intelligence',
      icon: <Sparkles size={20} />,
      textColor: 'text-purple-400',
      bgColor: 'bg-purple-500',
      items: [
        {
          name: 'Groq & Gemini',
          desc: 'Multi-model AI reasoning for high-precision metadata resolution.',
        },
        {
          name: 'Deezer/iTunes',
          desc: 'Authoritative ISRC verification and high-fidelity asset mapping.',
        },
      ],
    },
    {
      category: 'Infrastructure',
      icon: <Database size={20} />,
      textColor: 'text-emerald-400',
      bgColor: 'bg-emerald-500',
      items: [
        {
          name: 'Turso (libSQL)',
          desc: 'Edge-hosted persistent registry for global track indexing.',
        },
        {
          name: 'Odesli API',
          desc: 'Industry-standard link resolution and cross-platform bridge logic.',
        },
      ],
    },
    {
      category: 'Interface',
      icon: <Layout size={20} />,
      textColor: 'text-blue-400',
      bgColor: 'bg-blue-500',
      items: [
        {
          name: 'React 19',
          desc: 'Modern declarative UI with high-performance concurrent rendering.',
        },
        {
          name: 'Framer Motion',
          desc: 'GPU-accelerated management for complex interface transitions.',
        },
      ],
    },
    {
      category: 'Flow & Logic',
      icon: <Binary size={20} />,
      textColor: 'text-amber-400',
      bgColor: 'bg-amber-500',
      items: [
        {
          name: 'Web Worker + OPFS Muxer',
          desc: 'Off-main-thread mediabunny remuxing that streams 4K straight to disk via the Origin Private File System.',
        },
        {
          name: 'Reactive Pulse',
          desc: 'Server-Sent Events (SSE) for live backend telemetry and orchestration telemetry.',
        },
      ],
    },
  ];

  const tributeRef = useRef(null);
  const isTributeInView = useInView(tributeRef, { amount: 0.2 });
  const shineControls = useAnimation();

  useEffect(() => {
    if (isTributeInView) {
      shineControls.start({
        x: '250%',
        transition: { duration: 2.5, ease: [0.23, 1, 0.32, 1], delay: 0.2 },
      });
    } else {
      shineControls.start({ x: '-150%', transition: { duration: 0 } });
    }
  }, [isTributeInView, shineControls]);

  return (
    // skipcq: JS-0415
    <div className="w-full flex flex-col gap-12 pb-12">
      <SEO
        title="Tech Stack — Open-Source Engines & Models"
        description="The technologies behind Phantom: React 19, Vite, Express 5, Turso, FFmpeg and yt-dlp."
        canonicalUrl="/resources/stack"
      />

      <header className="text-center flex flex-col items-center gap-4">
        <div className="inline-flex items-center gap-2 px-4 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-[10px] font-black uppercase tracking-[0.2em] mb-4">
          <Code2 size={12} /> Technical Foundation
        </div>
        <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tighter text-white">
          The <span className="text-cyan-400">Stack</span>
        </h1>
        <p className="text-gray-400 max-w-xl font-medium">
          Standing on the shoulders of open-source giants.
        </p>
      </header>

      <section className="space-y-8">
        <div className="flex items-center gap-3 px-4">
          <Box className="text-cyan-400" size={20} />
          <h2 className="text-white font-black uppercase tracking-[0.2em] text-xs">
            Core Engines
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <GlassCard className="group relative overflow-hidden p-8 border-cyan-500/20 bg-cyan-500/5">
            <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity">
              <Terminal size={100} className="text-cyan-400" />
            </div>
            <div className="relative z-10 space-y-4">
              <div className="text-cyan-400 text-2xl font-black uppercase tracking-tighter">
                yt-dlp
              </div>
              <p className="text-gray-300 text-sm leading-relaxed max-sm:text-xs max-w-sm">
                The world&apos;s most advanced media manifest resolver. It
                provides the low-level resolution required to bypass
                restrictions and establish high-speed source connections.
              </p>
              <div className="inline-flex items-center gap-2 text-[10px] font-black text-cyan-500 uppercase tracking-widest bg-cyan-500/10 px-3 py-1 rounded-full">
                Manifest Resolver
              </div>
            </div>
          </GlassCard>

          <GlassCard className="group relative overflow-hidden p-8 border-purple-500/20 bg-purple-500/5">
            <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity">
              <Cpu size={100} className="text-purple-400" />
            </div>
            <div className="relative z-10 space-y-4">
              <div className="text-purple-400 text-2xl font-black uppercase tracking-tighter">
                FFmpeg 8.x &amp; mediabunny
              </div>
              <p className="text-gray-300 text-sm leading-relaxed max-sm:text-xs max-w-sm">
                The standard multimedia framework. Phantom utilizes a hybrid
                model, combining server-side FFmpeg memory pipes with
                client-side <code>mediabunny</code> remuxing for high-speed,
                distributed media synthesis.
              </p>
              <div className="inline-flex items-center gap-2 text-[10px] font-black text-purple-500 uppercase tracking-widest bg-purple-500/10 px-3 py-1 rounded-full">
                Processing Engine
              </div>
            </div>
          </GlassCard>
        </div>
      </section>

      <section className="space-y-8">
        <div className="flex items-center gap-3 px-4">
          <Layers className="text-gray-500" size={20} />
          <h2 className="text-gray-500 font-black uppercase tracking-[0.2em] text-xs">
            Supporting Ecosystem
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {supportingStack.map((group) => (
            <GlassCard
              key={group.category}
              className="group relative overflow-hidden"
            >
              <div
                className={`absolute inset-y-0 left-0 w-1 ${group.bgColor} opacity-40 group-hover:opacity-100 group-hover:w-1.5 transition-all duration-500`}
              />

              <div className="p-8 flex flex-col h-full">
                <div className="flex items-center gap-3 mb-6">
                  <div className={`${group.textColor} opacity-80`}>
                    {group.icon}
                  </div>
                  <h3 className="text-white font-black uppercase tracking-widest text-sm">
                    {group.category}
                  </h3>
                </div>

                <div className="grid gap-6">
                  {group.items.map((item) => (
                    <div key={item.name} className="space-y-1.5">
                      <div
                        className={`${group.textColor} text-xs font-black uppercase tracking-wide`}
                      >
                        {item.name}
                      </div>
                      <p className="text-gray-400 text-[11px] leading-relaxed font-medium">
                        {item.desc}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </GlassCard>
          ))}
        </div>
      </section>

      <motion.section
        ref={tributeRef}
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.8 }}
        className="mt-12 group relative"
      >
        <div className="absolute -inset-1 rounded-[3rem] bg-gradient-to-r from-cyan-500/20 via-purple-500/20 to-cyan-500/20 blur-2xl opacity-40 animate-pulse transition-opacity duration-1000" />

        <div className="relative p-12 rounded-[3rem] bg-[#020617]/60 backdrop-blur-3xl border border-cyan-500/20 text-center overflow-hidden isolation-auto transform-gpu">
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-transparent to-purple-500/10 opacity-50 pointer-events-none" />

          <motion.div
            animate={shineControls}
            initial={{ x: '-150%' }}
            style={{ skewX: -45 }}
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.12] to-transparent pointer-events-none z-20 transform-gpu"
          />

          <div className="relative z-10 space-y-6">
            <div className="inline-flex items-center gap-3 px-4 py-1.5 rounded-full bg-cyan-400/10 border border-cyan-400/20 text-cyan-300 font-black uppercase tracking-[0.4em] text-[9px] mb-2">
              <Heart
                size={12}
                fill="currentColor"
                className="text-cyan-400 animate-pulse"
              />{' '}
              A Note of Gratitude
            </div>
            <p className="text-lg text-cyan-50 leading-relaxed max-w-2xl mx-auto font-medium">
              Phantom functions as an independent orchestration bridge,
              coordinating powerful media engines into a unified interface. The
              true complexity is handled by the legendary contributors behind{' '}
              <a
                href="https://github.com/yt-dlp/yt-dlp"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white font-black underline decoration-cyan-400 decoration-2 underline-offset-8 bg-cyan-400/10 px-2 py-0.5 rounded-md hover:bg-cyan-400/20 transition-colors"
              >
                yt-dlp
              </a>{' '}
              and{' '}
              <a
                href="https://github.com/FFmpeg/FFmpeg"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white font-black underline decoration-cyan-400 decoration-2 underline-offset-8 bg-cyan-400/10 px-2 py-0.5 rounded-md hover:bg-cyan-400/20 transition-colors"
              >
                FFmpeg
              </a>
              . Sincere respect to the maintainers who dedicate their time to
              keeping these tools free and open for everyone.
            </p>
            <div className="flex flex-col items-center gap-2 mt-8 opacity-60">
              <div className="h-px w-12 bg-cyan-500/30" />
              <p className="text-cyan-400/60 text-[10px] font-black uppercase tracking-[0.5em]">
                Grateful for the open-source community
              </p>
            </div>
          </div>
        </div>
      </motion.section>

      <footer className="flex flex-col items-center gap-8 mt-8">
        <button
          onClick={() => window.history.back()}
          className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest border border-white/10 px-8 py-3 rounded-full hover:bg-white/10 hover:border-white/20 transition-all duration-300 font-black text-gray-400"
        >
          Return to Hub
        </button>
      </footer>
    </div>
  );
};

export default TechStack;
