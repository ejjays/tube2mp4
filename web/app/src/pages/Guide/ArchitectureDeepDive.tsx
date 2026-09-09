import React, { useEffect } from 'react';

import {
  Cpu,
  Zap,
  Database,
  ShieldCheck,
  Search,
  ChevronRight,
  Info,
  Activity,
  Smartphone,
  Shield,
  Github,
} from 'lucide-react';
import { GlassCard } from '../../components/ui/GlassCard';
import SEO from '../../components/utils/SEO';

const ArchitectureDeepDive = () => {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const coreSystems = [
    {
      title: 'Search Architect',
      tag: 'RESOLUTION CORE',
      icon: <Search size={20} />,
      textColor: 'text-cyan-400',
      bgColor: 'bg-cyan-500',
      description:
        'Ensures metadata integrity through multi-layered verification. Executes a staggered resolution race using ISRC and semantic vectors.',

      points: [
        {
          text: 'Asynchronous Search: ISRC → Semantic → LLM Synthesis.',
          bold: true,
        },
        {
          text: 'Duration Validation: < 8s drift rejection.',
        },
        {
          text: 'Authoritative ISRC mapping via Deezer/iTunes.',
        },
      ],
    },
    {
      title: 'The Pulse',
      tag: 'TELEMETRY STREAM',
      icon: <Activity size={20} />,
      textColor: 'text-amber-400',
      bgColor: 'bg-amber-500',
      description:
        'Provides absolute transparency into backend processes. Real-time micro-decisions are streamed directly to the interface.',

      points: [
        {
          text: 'Real-time SSE: Connection → Resolution → Pipe.',
          bold: true,
        },
        {
          text: 'Instant-snap progress interpolation.',
        },
        {
          text: 'Bidirectional system heartbeat monitoring.',
        },
      ],
    },
    {
      title: 'RAM-Only Pipeline',
      tag: 'ZERO-DISK ENGINE',
      icon: <Shield size={20} />,
      textColor: 'text-emerald-400',
      bgColor: 'bg-emerald-500',
      description:
        'Stateless streaming architecture that prioritizes speed and security by eliminating disk I/O.',

      points: [
        {
          text: 'Pure Memory Buffer: 0% permanent storage footprint.',
          bold: true,
        },
        {
          text: 'Native Node.js Stream handling.',
          bold: true,
        },
        {
          text: 'Real-time transcoding and metadata injection.',
        },
      ],
    },
    {
      title: 'Edge Muxing Engine',
      tag: 'DISTRIBUTED SYNTHESIS',
      icon: <Zap size={20} />,
      textColor: 'text-blue-400',
      bgColor: 'bg-blue-500',
      description:
        'Offloads high-bandwidth media synthesis to the client device. Orchestrates browser-level muxing in a Web Worker (mediabunny, zero re-encode) that streams straight to disk via OPFS, for infinite network scalability.',
      points: [
        {
          text: 'Smart Hybrid Routing: < 400MB Edge / > 400MB Cloud.',
          bold: true,
        },
        {
          text: 'Unthrottled Tunneling: Direct yt-dlp backend proxy (15MB/s+).',
          bold: true,
        },
        {
          text: 'Secure Context execution with COOP/COEP compliance.',
        },
      ],
    },
    {
      title: 'Global Edge Registry',
      tag: 'PERSISTENT INDEX',
      icon: <Database size={20} />,
      textColor: 'text-purple-400',
      bgColor: 'bg-purple-500',
      description:
        'A collaborative cloud memory layer. Verified tracks are indexed globally for near-instant repeat resolution.',

      points: [
        {
          text: 'Turso-powered libSQL edge registry.',
          bold: true,
        },
        {
          text: 'Persistent metadata caching (0.1s hydration).',
          bold: true,
        },
        {
          text: 'Just-In-Time URL authorization refresh.',
        },
      ],
    },
  ];

  return (
    // skipcq: JS-0415
    <div className="w-full flex flex-col gap-10 pb-12">
      <SEO
        title="Architecture Deep Dive — How the Media Engine Works"
        description="Inside the Phantom media engine: parallel resolution race, edge registry, hybrid muxing, on-device Web Worker offload, and the dual-GPU MIR kernel."
        canonicalUrl="/resources/architecture"
      />
      <header className="text-center flex flex-col items-center gap-4">
        <div className="inline-flex items-center gap-2 px-4 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-[10px] font-black uppercase tracking-[0.2em] mb-4">
          <Cpu size={12} />
          Technical Architecture
        </div>
        <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tighter text-white">
          Beyond the <span className="text-cyan-400">Wrapper</span>
        </h1>
        <p className="text-gray-400 max-w-xl font-medium text-lg leading-relaxed">
          Solving the complexities of modern media orchestration through
          high-fidelity engineering.
        </p>
      </header>
      <section className="bg-white/5 backdrop-blur-xl border border-white/10 p-8 rounded-[2rem] shadow-2xl relative overflow-hidden group">
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-cyan-500/10 blur-[80px] group-hover:bg-cyan-500/20 transition-all duration-700"></div>
        <h2 className="text-2xl font-black text-cyan-400 mb-4 flex items-center gap-3 uppercase tracking-tighter">
          🚀 The Orchestration Layer
        </h2>
        <p className="text-gray-300 leading-relaxed text-lg font-medium">
          Phantom isn&apos;t just a UI; it&apos;s a{' '}
          <span className="text-white font-bold">
            parallel resolution system
          </span>
          . The engine solves complex edge cases—like TikTok&apos;s fragmented
          muxing, Spotify&apos;s metadata drift, and slow server-side
          re-encoding—through an optimized delivery pipeline.
        </p>
      </section>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {coreSystems.map((system) => {
          const isLastAndOdd =
            coreSystems.indexOf(system) === coreSystems.length - 1 &&
            coreSystems.length % 2 !== 0;
          return isLastAndOdd ? (
            // skipcq: JS-0415
            <div
              key={system.title}
              className="md:col-span-2 flex justify-center"
            >
              <GlassCard className="group relative overflow-hidden w-full md:max-w-[calc(50%-0.75rem)] mx-auto">
                <div
                  className={`absolute inset-y-0 left-0 w-1 ${system.bgColor} opacity-40 blur-[0.5px] group-hover:opacity-100 group-hover:w-1.5 transition-all duration-500`}
                />
                <div className="p-8 flex flex-col h-full">
                  <div className="flex flex-col items-start gap-3 mb-6">
                    <h3
                      className={`text-xl font-black uppercase tracking-tight ${system.textColor}`}
                    >
                      {system.title}
                    </h3>
                    <span
                      className={`${system.bgColor} text-black text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest`}
                    >
                      {system.tag}
                    </span>
                  </div>
                  <p className="text-sm text-gray-400 mb-8 font-medium leading-relaxed">
                    {system.description}
                  </p>
                  <ul className="space-y-4 mt-auto">
                    {system.points.map((point) => (
                      <li
                        key={point.text}
                        className={`flex items-start gap-3 text-xs ${system.textColor}`}
                      >
                        <span className="shrink-0 mt-0.5 opacity-80">
                          <ChevronRight size={14} />
                        </span>
                        <span
                          className={`${
                            point.bold ? 'text-white font-bold' : 'opacity-80'
                          }`}
                        >
                          {point.text}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </GlassCard>
            </div>
          ) : (
            <GlassCard
              key={system.title}
              className="group relative overflow-hidden"
            >
              <div
                className={`absolute inset-y-0 left-0 w-1 ${system.bgColor} opacity-40 blur-[0.5px] group-hover:opacity-100 group-hover:w-1.5 transition-all duration-500`}
              />
              <div className="p-8 flex flex-col h-full">
                <div className="flex flex-col items-start gap-3 mb-6">
                  <h3
                    className={`text-xl font-black uppercase tracking-tight ${system.textColor}`}
                  >
                    {system.title}
                  </h3>
                  <span
                    className={`${system.bgColor} text-black text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest`}
                  >
                    {system.tag}
                  </span>
                </div>
                <p className="text-sm text-gray-400 mb-8 font-medium leading-relaxed">
                  {system.description}
                </p>
                <ul className="space-y-4 mt-auto">
                  {system.points.map((point) => (
                    <li
                      key={point.text}
                      className={`flex items-start gap-3 text-xs ${system.textColor}`}
                    >
                      <span className="shrink-0 mt-0.5 opacity-80">
                        <ChevronRight size={14} />
                      </span>
                      <span
                        className={`${
                          point.bold ? 'text-white font-bold' : 'opacity-80'
                        }`}
                      >
                        {point.text}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </GlassCard>
          );
        })}
      </div>
      <section className="bg-black/40 backdrop-blur-xl border border-cyan-500/20 p-8 rounded-[2rem] shadow-inner relative overflow-hidden">
        <div className="flex items-center gap-3 mb-6">
          <span className="text-2xl">🔬</span>
          <h2 className="text-xl font-black text-cyan-400 uppercase tracking-tighter">
            Resilient Muxing Engine
          </h2>
        </div>
        <div className="space-y-6 text-sm text-gray-400 leading-relaxed">
          <p>
            Handling platforms like{' '}
            <span className="text-white font-bold">TikTok</span>,{' '}
            <span className="text-white font-bold">Instagram</span>, and{' '}
            <span className="text-white font-bold">Reddit</span> requires a{' '}
            <span className="text-amber-400 font-bold">
              Header Spoofing & Double-Pipe Strategy
            </span>
            . While conventional tools often fail due to authorization errors or
            fragmented assets, Phantom captures streams in memory and re-muxes
            them into a seekable container on-the-fly.
          </p>
          <div className="bg-black/30 p-5 rounded-2xl border border-white/5 font-mono text-[10px] sm:text-xs text-gray-500 shadow-inner flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="text-cyan-500 font-bold">STEP 01:</span>
              <span>
                Bypass Throttling via iOS-Native Turbo Extraction Profile
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-purple-500 font-bold">STEP 02:</span>
              <span>Parallel Pipe capture via FFmpeg (Double-Pipe Logic)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-emerald-500 font-bold">STEP 03:</span>
              <span>Virtual Container Muxing (Frag-Keyframe)</span>
            </div>
          </div>
          <p className="italic text-gray-500 text-xs flex items-center gap-2">
            <Info size={12} />
            This approach ensures absolute video-audio sync without utilizing
            server-side disk space.
          </p>
        </div>
      </section>
      <section className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-white/5 p-8 rounded-[2rem] border border-white/10">
          <div className="flex items-center gap-3 mb-4">
            <Smartphone className="text-cyan-400" size={24} />
            <h2 className="text-xl font-black text-white uppercase tracking-tighter">
              Universal Media Core
            </h2>
          </div>
          <p className="text-sm text-gray-400 leading-relaxed font-medium">
            Phantom is engineered for platform-agnostic delivery. While
            currently optimized for the{' '}
            <span className="text-white">Web PWA</span> and{' '}
            <span className="text-white">Desktop Interface</span>, the
            architecture includes a dedicated bridge for{' '}
            <span className="text-white font-bold italic">
              upcoming native mobile expansion
            </span>
            .
          </p>
        </div>
        <div className="bg-white/5 p-8 rounded-[2rem] border border-white/10">
          <div className="flex items-center gap-3 mb-4">
            <ShieldCheck className="text-emerald-400" size={24} />
            <h2 className="text-xl font-black text-white uppercase tracking-tighter">
              Security & Privacy
            </h2>
          </div>
          <p className="text-sm text-gray-400 leading-relaxed font-medium">
            Because the delivery pipeline is{' '}
            <span className="text-white">RAM-only</span>, processed media never
            touches persistent storage. It exists as a volatile stream of bytes
            that is purged the moment the client download is complete.
          </p>
        </div>
      </section>
      <section className="mt-4">
        <GlassCard className="group relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
          <div className="p-8 md:p-12 flex flex-col md:flex-row items-center justify-between gap-8 relative z-10">
            <div className="space-y-4 text-center md:text-left">
              <div className="inline-flex items-center gap-2 text-cyan-400 font-black uppercase tracking-[0.3em] text-[10px]">
                <Github size={14} />
                Open Source Environment
              </div>
              <h2 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tighter">
                Independent <span className="text-cyan-400">Project</span>
              </h2>
              <p className="text-gray-400 text-sm max-w-lg leading-relaxed font-medium">
                Phantom is an independent development project dedicated to
                building cleaner media tools. If you find the orchestration
                engine useful, a star on GitHub would be greatly appreciated.
              </p>
              <p className="text-gray-500 text-xs font-medium leading-relaxed">
                Free software under{' '}
                <a
                  href="https://github.com/ejjays/phantom/blob/main/LICENSE"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-cyan-400 hover:underline"
                >
                  Apache-2.0
                </a>{' '}
                — you&apos;re free to read, run, and modify the full source.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-4">
              <a
                href="https://github.com/ejjays/phantom"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 bg-white text-black font-black uppercase text-[10px] tracking-widest px-8 py-4 rounded-2xl hover:scale-105 transition-transform whitespace-nowrap"
              >
                <Github size={16} />
                Support on GitHub
              </a>
            </div>
          </div>
        </GlassCard>
      </section>
      <footer className="flex flex-col items-center gap-8 mt-12">
        <div className="space-y-4 text-center">
          <p className="text-sm text-cyan-400 font-black uppercase tracking-widest pt-4 border-t border-white/5">
            Open Web. High Fidelity. Independent Engineering.
          </p>
        </div>
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

export default ArchitectureDeepDive;
