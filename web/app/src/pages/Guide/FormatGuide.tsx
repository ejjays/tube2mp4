import React, { useEffect } from 'react';

import { Zap, ShieldCheck, Headphones, Info } from 'lucide-react';
import { GlassCard } from '../../components/ui/GlassCard';
import SEO from '../../components/utils/SEO';

const FormatGuide = () => {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const features = [
    {
      title: 'MP3 (Fast)',
      tag: 'SPEED MODE',
      borderColor: 'border-emerald-500',
      textColor: 'text-emerald-400',
      bgColor: 'bg-emerald-400',
      description:
        'The fastest way to download. Optimized for instant starts and universal device support.',

      points: [
        {
          icon: <Zap size={16} />,
          text: 'Instant: ~0.4s startup.',
          bold: true,
        },
        {
          icon: <ShieldCheck size={16} />,
          text: 'Professional 192kbps CBR quality.',
        },
        {
          icon: <Info size={16} />,
          text: 'Tradeoff: Re-encoding loss.',
          subtle: true,
        },
      ],
    },
    {
      title: 'M4A (Pro)',
      tag: 'ORIGINAL QUALITY',
      borderColor: 'border-cyan-500',
      textColor: 'text-cyan-400',
      bgColor: 'bg-cyan-400',
      description:
        'The Gold Standard. Crystal-clear audio that works on every device without losing a single bit.',

      points: [
        {
          icon: <ShieldCheck size={16} />,
          text: 'Lossless Direct-Stream: No re-encoding.',
          bold: true,
        },
        {
          icon: <Headphones size={16} />,
          text: 'Better frequency response than MP3.',
        },
        {
          icon: <ShieldCheck size={16} />,
          text: 'Perfect for iPhone, Android, & Cars.',
        },
      ],
    },
  ];

  return (
    // skipcq: JS-0415
    <div className="w-full flex flex-col gap-10">
      <SEO
        title="Format & Quality Guide — Audio and Video Formats"
        description="Pick the right format: MP3 vs M4A, MP4 vs WebM, 4K vs 1080p, 320kbps vs 192kbps. Bitrates, codecs, and quality recommendations explained."
        canonicalUrl="/resources/audio-guide"
      />
      <header className="text-center flex flex-col items-center gap-4">
        {' '}
        <div className="inline-flex items-center gap-2 px-4 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-[10px] font-black uppercase tracking-[0.2em] mb-4">
          <Zap size={12} />
          Standard Optimized
        </div>
        <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tighter text-white">
          Audio <span className="text-cyan-400">Format Guide</span>
        </h1>
        <p className="text-gray-400 max-w-xl font-medium">
          The Science of Perfect Audio. Choose your priority: Speed or Quality.
        </p>
      </header>
      <section className="bg-white/5 backdrop-blur-xl border border-white/10 p-8 rounded-[2rem] shadow-2xl relative overflow-hidden group">
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-cyan-500/10 blur-[80px] group-hover:bg-cyan-500/20 transition-all duration-700"></div>
        <h2 className="text-2xl font-black text-cyan-400 mb-4 flex items-center gap-3 uppercase tracking-tighter">
          🚀 Two Engines, One App
        </h2>
        <p className="text-gray-300 leading-relaxed text-lg">
          <span className="text-white font-bold">Phantom</span>features a Hybrid
          Engine. Use our{' '}
          <span className="text-emerald-400 font-bold underline decoration-emerald-500/30 underline-offset-4">
            Lightning Engine
          </span>{' '}
          for instant MP3s, or our{' '}
          <span className="text-cyan-400 font-bold underline decoration-cyan-500/30 underline-offset-4">
            Direct-Stream Engine
          </span>{' '}
          for original M4A files that come straight from the master servers
          without re-encoding.
        </p>
      </section>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto w-full">
        {features.map((feature) => (
          <GlassCard
            key={feature.title}
            className="group relative overflow-hidden"
          >
            <div
              className={`absolute inset-y-0 left-0 w-1 ${feature.bgColor} opacity-40 blur-[0.5px] group-hover:opacity-100 group-hover:w-1.5 transition-all duration-500`}
            />
            <div className="p-8 flex flex-col h-full">
              <div className="flex flex-col items-start gap-3 mb-6">
                <h3
                  className={`text-xl md:text-2xl font-black uppercase tracking-tight whitespace-nowrap ${feature.textColor}`}
                >
                  {feature.title}
                </h3>
                <span
                  className={`${feature.bgColor} text-black text-[10px] font-black px-3 py-1 rounded-full whitespace-nowrap`}
                >
                  {feature.tag}
                </span>
              </div>
              <p className="text-sm text-gray-400 mb-8 font-medium leading-relaxed">
                {feature.description}
              </p>
              <ul className="space-y-4 mt-auto">
                {feature.points.map((point) => (
                  <li
                    key={point.text}
                    className={`flex items-start gap-3 text-xs ${point.subtle ? 'text-gray-500 italic' : feature.textColor}`}
                  >
                    <span className="shrink-0 mt-0.5 opacity-80">
                      {point.icon}
                    </span>
                    <span
                      className={`${point.bold ? 'text-white font-bold' : ''}`}
                    >
                      {point.text}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </GlassCard>
        ))}
      </div>
      <section className="bg-black/40 backdrop-blur-xl border border-cyan-500/20 p-8 rounded-[2rem] shadow-inner">
        <div className="flex items-center gap-3 mb-6">
          <span className="text-2xl">🔬</span>
          <h2 className="text-xl font-black text-cyan-400 uppercase tracking-tighter">
            Speed vs Quality: The Tech
          </h2>
        </div>
        <div className="space-y-6 text-sm text-gray-400 leading-relaxed">
          <p>
            <span className="text-white font-bold">MP3 (Speed Mode)</span>uses{' '}
            <span className="text-emerald-400 font-bold">
              High-Fidelity Real-Time Transcoding
            </span>
            . We decode the source and immediately re-encode it into a
            professional 192kbps CBR stream. This ensures perfect duration
            accuracy and maximum compatibility.
          </p>
          <div className="bg-black/30 p-5 rounded-2xl border border-white/5 font-mono text-[10px] sm:text-xs text-gray-500 shadow-inner flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="text-emerald-500 font-bold">MP3 Engine:</span>
              <span>Source → FFmpeg Transcode → Client</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-cyan-500 font-bold">M4A Engine:</span>
              <span>Source → ADTS Bitstream → Client</span>
            </div>
          </div>
          <p>
            <span className="text-white font-bold">
              Direct-Stream Copy (M4A)
            </span>{' '}
            preserves the original AAC bitstream. We use specialized algorithms
            to stream the audio in ADTS format, allowing your player to read
            duration and seek correctly without losing a single bit of quality.
          </p>
        </div>
      </section>
      <footer className="flex flex-col items-center gap-8 mt-12 pb-12">
        <div className="space-y-4 text-center">
          <div className="space-y-1 text-gray-500 text-sm">
            <p>
              For instant downloads & universal support, choose{' '}
              <span className="text-emerald-400 font-bold">MP3</span>.
            </p>
            <p>
              For maximum quality & original fidelity, choose{' '}
              <span className="text-cyan-400 font-bold">M4A</span>.
            </p>
          </div>
          <p className="text-sm text-cyan-400 font-black uppercase tracking-widest pt-4 border-t border-white/5">
            God bless & thank you for using Phantom.
          </p>
        </div>
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={() => window.close()}
            className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest border border-white/10 px-8 py-3 rounded-full hover:bg-white/10 hover:border-white/20 transition-all duration-300 font-black text-gray-400"
          >
            Close Guide
          </button>
        </div>
      </footer>
    </div>
  );
};

export default FormatGuide;
