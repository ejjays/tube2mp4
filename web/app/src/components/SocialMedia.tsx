import React from 'react';
import XIcon from '../assets/icons/XIcon';
import InstaGramIcon from '../assets/icons/InstaGramIcon';
import FaceBookIcon from '../assets/icons/FaceBookIcon';

const SVGDefinitions = () => (
  <svg width={0} height={0} style={{ position: 'absolute' }}>
    <defs>
      <clipPath id="squircleClip" clipPathUnits="objectBoundingBox">
        <path d="M 0,0.5 C 0,0 0,0 0.5,0 S 1,0 1,0.5 1,1 0.5,1 0,1 0,0.5" />
      </clipPath>
      <radialGradient
        id="instaGradient1"
        cx="0"
        cy="0"
        r="1"
        gradientUnits="userSpaceOnUse"
        gradientTransform="translate(12 23) rotate(-55.3758) scale(25.5196)"
      >
        <stop stopColor="#B13589" />
        <stop offset="0.79309" stopColor="#C62F94" />
        <stop offset="1" stopColor="#8A3AC8" />
      </radialGradient>
      <radialGradient
        id="instaGradient2"
        cx="0"
        cy="0"
        r="1"
        gradientUnits="userSpaceOnUse"
        gradientTransform="translate(11 31) rotate(-65.1363) scale(22.5942)"
      >
        <stop stopColor="#E0E8B7" />
        <stop offset="0.444662" stopColor="#FB8A2E" />
        <stop offset="0.71474" stopColor="#E2425C" />
        <stop offset="1" stopColor="#E2425C" stopOpacity="0" />
      </radialGradient>
      <radialGradient
        id="instaGradient3"
        cx="0"
        cy="0"
        r="1"
        gradientUnits="userSpaceOnUse"
        gradientTransform="translate(0.500002 3) rotate(-8.1301) scale(38.8909 8.31836)"
      >
        <stop offset="0.156701" stopColor="#406ADC" />
        <stop offset="0.467799" stopColor="#6A45BE" />
        <stop offset="1" stopColor="#6A45BE" stopOpacity="0" />
      </radialGradient>
    </defs>
  </svg>
);

const SocialMedia = () => {
  const openLink = (link: string) => {
    window.open(link, '_blank', 'noopener, noreferrer');
  };

  return (
    // skipcq: JS-0415
    <div>
      <SVGDefinitions />
      <div className="flex flex-col items-center gap-y-2">
        <span className="text-white/50 text-[10px] sm:text-xs font-medium uppercase tracking-[0.2em]">
          Follow me
        </span>
        <div className="relative">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl" />
          <div className="relative p-2 flex items-center gap-x-5 sm:gap-x-6">
            <button
              style={{ clipPath: 'url(#squircleClip)' }}
              className="w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-br from-blue-500 to-blue-700 rounded-xl flex items-center justify-center shadow-lg border border-blue-400/50 cursor-pointer transform transition-all duration-300 ease-out hover:scale-110 hover:-translate-y-2 hover:shadow-2xl focus:outline-none focus:ring-2 focus:ring-blue-400"
              onClick={() => openLink('https://www.facebook.com/ejjaysz')}
              aria-label="Facebook"
            >
              <FaceBookIcon size={28} />
            </button>
            <button
              style={{ clipPath: 'url(#squircleClip)' }}
              className="w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400 rounded-xl flex items-center justify-center shadow-lg border border-white/20 cursor-pointer transform transition-all duration-300 ease-out hover:scale-110 hover:-translate-y-2 hover:shadow-2xl focus:outline-none focus:ring-2 focus:ring-pink-400"
              onClick={() => openLink('https://instagram.com/ejjay.alloso')}
              aria-label="Instagram"
            >
              <InstaGramIcon size={32} />
            </button>
            <button
              style={{ clipPath: 'url(#squircleClip)' }}
              className="w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-br from-slate-800 to-slate-950 rounded-xl flex items-center justify-center shadow-lg border border-white/10 cursor-pointer transform transition-all duration-300 ease-out hover:scale-110 hover:-translate-y-2 hover:shadow-2xl hover:from-slate-700 hover:to-black focus:outline-none focus:ring-2 focus:ring-slate-400"
              onClick={() => openLink('https://x.com/ejjaysz')}
              aria-label="X (Twitter)"
            >
              <XIcon size={22} className="text-gray-100 drop-shadow-md" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SocialMedia;
