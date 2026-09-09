import React, { useEffect } from 'react';

import {
  ShieldAlert,
  EyeOff,
  Lock,
  Server,
  Trash2,
  Ban,
  Zap,
  Code,
} from 'lucide-react';
import { GlassCard } from '../../components/ui/GlassCard';
import SEO from '../../components/utils/SEO';

const SecurityPrivacy = () => {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const protocols = [
    {
      icon: <EyeOff className="text-cyan-400" />,
      title: 'No Tracking',
      description:
        "We don't use tracking cookies or persistent identifiers. Your conversion history is never linked to your identity.",
    },
    {
      icon: <Trash2 className="text-rose-400" />,
      title: 'Zero Retention',
      description:
        'Media files are streamed directly to your device. We never store your converted files on our server disks.',
    },
    {
      icon: <Lock className="text-emerald-400" />,
      title: 'Secure Pipelines',
      description:
        'All metadata races and streaming tunnels are protected with industry-standard TLS encryption.',
    },
  ];

  return (
    // skipcq: JS-0415
    <div className="w-full flex flex-col gap-12">
      <SEO
        title="Security & Privacy — How We Protect Your Data"
        description="How Phantom handles privacy: no registration, no tracking, ad-free, signed proxy URLs, and in-memory streaming with no disk storage."
        canonicalUrl="/resources/security"
      />
      <header className="text-center space-y-4">
        <div className="inline-flex items-center gap-2 px-4 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-[0.2em] mb-4">
          <ShieldAlert size={12} /> Privacy Guaranteed
        </div>
        <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tighter text-white">
          Security <span className="text-emerald-400">& Privacy</span>
        </h1>
        <p className="text-gray-400 text-lg font-medium max-w-2xl mx-auto">
          Your digital freedom is our priority. Engineered to be the most
          private way to access media.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {protocols.map((protocol) => (
          <GlassCard key={protocol.title} className="group">
            <div className="p-8">
              <div className="mb-6 transform group-hover:scale-110 transition-transform">
                {protocol.icon}
              </div>
              <h3 className="text-white font-bold text-xl mb-3">
                {protocol.title}
              </h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                {protocol.description}
              </p>
            </div>
          </GlassCard>
        ))}
      </div>

      <section className="bg-black/40 backdrop-blur-xl border border-white/10 p-8 md:p-12 rounded-[2.5rem] relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10">
          <Server size={120} className="text-cyan-500" />
        </div>

        <div className="relative z-10 space-y-8">
          <h2 className="text-2xl font-black text-white uppercase tracking-tighter flex items-center gap-3">
            <Ban className="text-rose-500" /> Our Ad-Free Commitment
          </h2>
          <div className="space-y-6 text-gray-300 leading-relaxed max-w-3xl">
            <p>
              Most online converters are riddled with dangerous pop-ups,
              malware, and intrusive trackers.{' '}
              <span className="text-white font-bold">
                Phantom is different.
              </span>{' '}
              We strictly prohibit advertisements to ensure a clean, safe, and
              fast environment.
            </p>
            <p>
              By bypassing traditional ad-networks, we eliminate the primary
              vector for malware distribution in the media conversion industry.
              Your device stays safe, and your experience remains uninterrupted.
            </p>
          </div>
        </div>
      </section>

      <section className="bg-gradient-to-r from-cyan-500/10 to-transparent border border-white/10 p-8 md:p-12 rounded-[2.5rem] relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10">
          <Zap size={120} className="text-cyan-400" />
        </div>

        <div className="relative z-10 space-y-6">
          <h2 className="text-2xl font-black text-white uppercase tracking-tighter flex items-center gap-3">
            <Zap className="text-cyan-400" /> Radical Transparency
          </h2>
          <div className="space-y-6 text-gray-300 leading-relaxed max-w-3xl">
            <p>
              We believe you should never have to guess what a tool is doing to
              your data. That&apos;s why Phantom features a{' '}
              <span className="text-white font-bold underline decoration-cyan-500/30 underline-offset-4">
                Real-Time Technical Logging
              </span>{' '}
              integrated to show directly into your screen.
            </p>
            <p>
              Every extraction step, from manifest resolution to stream muxing,
              is logged and visible to you. This &quot;Open-Window&quot; policy
              ensures that you can see exactly how the engine interacts with
              remote servers, proving there are no hidden background tasks or
              malicious redirects.
            </p>
          </div>
        </div>
      </section>

      <section className="grid md:grid-cols-2 gap-6">
        <div className="bg-cyan-500/5 border border-cyan-500/20 p-8 rounded-[2rem] space-y-4">
          <h3 className="text-white font-bold flex items-center gap-2">
            <Code size={18} className="text-cyan-400" /> Open-Source Core
          </h3>
          <p className="text-sm text-gray-400 leading-relaxed">
            Our backend utilizes the standard open-source{' '}
            <strong>yt-dlp</strong> library. We do not use proprietary
            &quot;black-box&quot; decoders that could hide malicious scripts.
          </p>
        </div>
        <div className="bg-purple-500/5 border border-purple-500/20 p-8 rounded-[2rem] space-y-4">
          <h3 className="text-white font-bold flex items-center gap-2">
            <Lock size={18} className="text-purple-400" /> Data Encryption
          </h3>
          <p className="text-sm text-gray-400 leading-relaxed">
            All communication between your browser and our API is encrypted
            using 256-bit TLS protocols, preventing third-party interception of
            your links.
          </p>
        </div>
      </section>

      <footer className="flex flex-col items-center gap-8 mt-12 pb-12">
        <div className="text-center">
          <p className="text-sm text-emerald-400 font-black uppercase tracking-widest">
            Your data remains your own.
          </p>
        </div>

        <button
          onClick={() => window.close()}
          className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest border border-white/10 px-10 py-4 rounded-full hover:bg-white/10 hover:border-white/20 transition-all duration-300 font-black text-gray-400"
        >
          Close Guide
        </button>
      </footer>
    </div>
  );
};

export default SecurityPrivacy;
