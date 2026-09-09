import React, { useEffect } from 'react';
import {
  Video,
  Monitor,
  Smartphone,
  Cpu,
  CheckCircle2,
  AlertTriangle,
  PlayCircle,
  ExternalLink,
  Laptop,
  Settings,
} from 'lucide-react';
import { GlassCard } from '../../components/ui/GlassCard';
import SEO from '../../components/utils/SEO';

const VideoGuide = () => {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const features = [
    {
      icon: <Monitor className="text-cyan-400" />,
      title: '8K & 4K Ultra-Resolution',
      text: 'Phantom scales beyond standard HD, resolving 4320p (8K) and 2160p (4K) master manifests for high-fidelity preservation.',
    },
    {
      icon: <PlayCircle className="text-purple-400" />,
      title: '60FPS+ High Frame Rate',
      text: 'Support for HFR streams (60fps and 120fps), preserving the fluid motion of modern gaming and action content.',
    },
    {
      icon: <Smartphone className="text-emerald-400" />,
      title: 'Gallery Optimized',
      text: "Our engine optimizes file headers so your 4K/8K downloads are immediately playable in your phone's native gallery.",
    },
  ];

  return (
    // skipcq: JS-0415
    <div className="w-full flex flex-col gap-12">
      <SEO
        title="Video Download Guide — How to Download in 4K"
        description="Guide to downloading 4K, 1080p, and 720p video from YouTube, TikTok, Instagram, and Facebook. Format choices, codecs, and quality tips."
        canonicalUrl="/resources/video-guide"
      />
      <header className="text-center space-y-4">
        <div className="inline-flex items-center gap-2 px-4 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-[10px] font-black uppercase tracking-[0.2em] mb-4">
          <Video size={12} />
          Pro Video Quality
        </div>
        <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tighter text-white">
          Video <span className="text-cyan-400">Quality</span>
        </h1>
        <p className="text-gray-400 text-lg font-medium max-w-2xl mx-auto">
          Pushing the limits of extraction with support for 8K/4K resolution and
          60fps+ high frame rates.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {features.map((f) => (
          <GlassCard key={f.title} className="group">
            <div className="p-8">
              <div className="mb-6 transform group-hover:scale-110 transition-transform">
                {f.icon}
              </div>
              <h3 className="text-white font-bold text-xl mb-3">{f.title}</h3>
              <p className="text-gray-400 text-sm leading-relaxed">{f.text}</p>
            </div>
          </GlassCard>
        ))}
      </div>

      <section className="bg-cyan-500/5 border border-cyan-500/20 p-8 rounded-[2.5rem] relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10">
          <Monitor size={120} className="text-cyan-500" />
        </div>
        <div className="relative z-10 space-y-4">
          <h2 className="text-2xl font-black text-white uppercase tracking-tighter">
            Smart Hybrid Routing
          </h2>
          <div className="space-y-4 text-gray-300 leading-relaxed">
            <p>
              Phantom utilizes an intelligent orchestration model to balance
              speed and device stability. For files up to{' '}
              <span className="text-cyan-400 font-bold">400 MB</span>, we deploy
              our Edge Muxing Engine (EME) which performs high-speed stream
              synchronization directly in your browser.
            </p>
            <p>
              For{' '}
              <span className="text-purple-400 font-bold">larger files</span>,
              the workload automatically shifts to our cloud infrastructure.
              This prevents mobile browser crashes and ensures complex ultra-HD
              synthesis doesn&apos;t exhaust your device memory.
            </p>
          </div>
        </div>
      </section>

      <section className="bg-amber-500/5 border border-amber-500/20 p-6 md:p-10 rounded-[2rem] flex flex-col gap-8">
        <div className="flex flex-col md:flex-row gap-6 items-center">
          <div className="bg-amber-500/20 p-4 rounded-2xl border border-amber-500/30 text-amber-400 shrink-0">
            <AlertTriangle size={32} />
          </div>
          <div className="space-y-2 text-center md:text-left">
            <h3 className="text-amber-400 font-black uppercase tracking-widest text-sm">
              Check Device Compatibility First
            </h3>
            <p className="text-gray-300 text-sm leading-relaxed font-medium">
              High resolution (4K/8K) and high frame rates (60fps+) require
              significant processing power. Downloading a format your device
              cannot handle may result in stuttering playback or overheating.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="bg-black/20 p-6 rounded-2xl border border-white/5 space-y-3">
            <div className="text-cyan-400 text-[10px] font-black uppercase tracking-widest">
              The Safe Standard
            </div>
            <div className="text-white font-bold text-sm">
              1080p & 4K (30fps)
            </div>
            <p className="text-gray-400 text-xs leading-relaxed">
              Recommended for most smartphones, tablets, and standard laptops.
              Provides high quality with universal stability.
            </p>
          </div>
          <div className="bg-black/20 p-6 rounded-2xl border border-white/5 space-y-3">
            <div className="text-purple-400 text-[10px] font-black uppercase tracking-widest">
              Performance Tier
            </div>
            <div className="text-white font-bold text-sm">4K (60fps) & 8K</div>
            <p className="text-gray-400 text-xs leading-relaxed">
              Requires dedicated hardware decoders (AV1/VP9) and high-bandwidth
              SoCs. Recommended for flagship devices only.
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-8">
        <div className="flex flex-col items-center text-center gap-3">
          <div className="inline-flex items-center gap-2 text-gray-500 font-black uppercase tracking-[0.3em] text-[9px]">
            <Settings size={12} /> Authoritative Verification
          </div>
          <h2 className="text-2xl font-black text-white uppercase tracking-tighter">
            Verify Your Hardware
          </h2>
          <p className="text-gray-400 text-sm max-w-xl font-medium leading-relaxed">
            Browsers often report restricted or throttled data to save battery.
            For 100% accurate specifications regarding your screen resolution
            and refresh rate, we recommend using these verified tools.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <GlassCard className="p-8 relative overflow-hidden group hover:bg-emerald-500/5 transition-all duration-500 border-white/10 hover:border-emerald-500/20">
            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
              <Smartphone size={80} className="text-emerald-400" />
            </div>
            <div className="relative z-10 space-y-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-emerald-500/10 rounded-2xl text-emerald-400">
                  <Smartphone size={24} />
                </div>
                <div className="text-left">
                  <div className="text-white font-black text-sm uppercase tracking-tight">
                    Device Info HW
                  </div>
                  <div className="text-emerald-500/60 text-[9px] font-black uppercase tracking-[0.2em]">
                    Best for Android
                  </div>
                </div>
              </div>
              <p className="text-gray-500 text-xs leading-relaxed font-medium">
                {' '}
                Authoritative report on physical resolution, panel type, and
                hardware decoders (AV1/VP9).
              </p>
              <a
                href="https://play.google.com/store/apps/details?id=com.ph03nix_007.deviceinfo"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-3.5 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl text-white text-[10px] font-black uppercase tracking-widest transition-all"
              >
                Get on Play Store <ExternalLink size={12} />
              </a>
            </div>
          </GlassCard>

          <GlassCard className="p-8 relative overflow-hidden group hover:bg-cyan-500/5 transition-all duration-500 border-white/10 hover:border-cyan-500/20">
            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
              <Cpu size={80} className="text-cyan-400" />
            </div>
            <div className="relative z-10 space-y-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-cyan-500/10 rounded-2xl text-cyan-400">
                  <Cpu size={24} />
                </div>
                <div className="text-left">
                  <div className="text-white font-black text-sm uppercase tracking-tight">
                    CPU-Z
                  </div>
                  <div className="text-cyan-500/60 text-[9px] font-black uppercase tracking-[0.2em]">
                    Industry Standard
                  </div>
                </div>
              </div>
              <p className="text-gray-500 text-xs leading-relaxed font-medium">
                The classic utility for real-time monitoring of SoC clock speeds
                and display capabilities.
              </p>
              <a
                href="https://www.cpuid.com/softwares/cpu-z-android.html"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-3.5 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl text-white text-[10px] font-black uppercase tracking-widest transition-all"
              >
                View Official Site <ExternalLink size={12} />
              </a>
            </div>
          </GlassCard>

          <GlassCard className="p-8 relative overflow-hidden group hover:bg-purple-500/5 transition-all duration-500 border-white/10 hover:border-purple-500/20">
            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
              <Laptop size={80} className="text-purple-400" />
            </div>
            <div className="relative z-10 space-y-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-purple-500/10 rounded-2xl text-purple-400">
                  <Laptop size={24} />
                </div>
                <div className="text-left">
                  <div className="text-white font-black text-sm uppercase tracking-tight">
                    System Specs
                  </div>
                  <div className="text-purple-500/60 text-[9px] font-black uppercase tracking-[0.2em]">
                    Built-in Tools
                  </div>
                </div>
              </div>
              <p className="text-gray-500 text-xs leading-relaxed font-medium">
                Desktop users can use{' '}
                <span className="text-white font-bold">DxDiag</span> (Windows)
                or <span className="text-white font-bold">System Report</span>{' '}
                (macOS) for accurate data.
              </p>
              <div className="py-3.5 bg-white/[0.02] border border-white/5 rounded-xl text-gray-600 text-[9px] font-black uppercase tracking-widest text-center">
                Authority Verified
              </div>
            </div>
          </GlassCard>
        </div>
      </section>

      <section className="bg-black/40 backdrop-blur-xl border border-white/10 p-8 md:p-12 rounded-[2.5rem] relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10">
          <Cpu size={120} className="text-cyan-500" />
        </div>
        <div className="relative z-10 space-y-8">
          <h2 className="text-2xl font-black text-white uppercase tracking-tighter">
            The Extraction Engine
          </h2>
          <div className="grid md:grid-cols-2 gap-10 items-center">
            <div className="space-y-6 text-gray-300 leading-relaxed text-base">
              <p>
                Phantom identifies the exact{' '}
                <span className="text-white font-bold">VP9</span> or{' '}
                <span className="text-white font-bold">AV1</span> master
                streams. We use an optimized{' '}
                <span className="text-cyan-400 font-bold">
                  Double-Pipe Architecture
                </span>{' '}
                to mux these high-bitrate video streams into a standard MP4
                container in real-time.
              </p>
              <p>
                Our process ensures that even at high resolutions, every pixel
                is preserved exactly as it exists on the source servers, with
                zero re-encoding loss.
              </p>
            </div>
            <div className="bg-cyan-500/5 rounded-[2rem] border border-cyan-500/20 p-6 space-y-4 font-mono text-xs">
              <div className="flex items-center gap-3 text-cyan-400">
                <CheckCircle2 size={14} />
                Resolving 8K/4K Master Streams
              </div>
              <div className="flex items-center gap-3 text-cyan-400">
                <CheckCircle2 size={14} />
                HFR (60/120fps) Detection
              </div>
              <div className="flex items-center gap-3 text-cyan-400">
                <CheckCircle2 size={14} />
                AV1/VP9 Stream Muxing
              </div>
              <div className="flex items-center gap-3 text-cyan-400">
                <CheckCircle2 size={14} />
                Dynamic Moov Atom Injection
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="flex flex-col items-center gap-8 mt-12 pb-12">
        <div className="text-center">
          <p className="text-sm text-cyan-400 font-black uppercase tracking-widest">
            True quality, no compromises.
          </p>
        </div>
        <button
          onClick={() => window.history.back()}
          className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest border border-white/10 px-10 py-4 rounded-full hover:bg-white/10 hover:border-white/20 transition-all duration-300 font-black text-gray-400"
        >
          Return to Hub
        </button>
      </footer>
    </div>
  );
};

export default VideoGuide;
