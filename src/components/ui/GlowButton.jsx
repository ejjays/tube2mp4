import React from 'react';

const GlowButton = ({ text = "glow button", onClick, disabled }) => {
  return (
    <>
      <style>{`
        @keyframes circle-1 { 33% { transform: translate(0px, 16px) translateZ(0); } 66% { transform: translate(12px, 64px) translateZ(0); } }
        @keyframes circle-2 { 33% { transform: translate(80px, -10px) translateZ(0); } 66% { transform: translate(72px, -48px) translateZ(0); } }
        @keyframes circle-3 { 33% { transform: translate(20px, 12px) translateZ(0); } 66% { transform: translate(12px, 4px) translateZ(0); } }
        @keyframes circle-4 { 33% { transform: translate(76px, -12px) translateZ(0); } 66% { transform: translate(112px, -8px) translateZ(0); } }
        @keyframes circle-5 { 33% { transform: translate(84px, 28px) translateZ(0); } 66% { transform: translate(40px, -32px) translateZ(0); } }
        @keyframes circle-6 { 33% { transform: translate(28px, -16px) translateZ(0); } 66% { transform: translate(76px, -56px) translateZ(0); } }
        @keyframes circle-7 { 33% { transform: translate(8px, 28px) translateZ(0); } 66% { transform: translate(20px, -60px) translateZ(0) ; } }
        @keyframes circle-8 { 33% { transform: translate(32px, -4px) translateZ(0); } 66% { transform: translate(56px, -20px) translateZ(0); } }
        @keyframes circle-9 { 33% { transform: translate(20px, -12px) translateZ(0); } 66% { transform: translate(80px, -8px) translateZ(0); } }
        @keyframes circle-10 { 33% { transform: translate(68px, 20px) translateZ(0); } 66% { transform: translate(100px, 28px) translateZ(0); } }
        @keyframes circle-11 { 33% { transform: translate(4px, 4px) translateZ(0); } 66% { transform: translate(68px, 20px) translateZ(0); } }
        @keyframes circle-12 { 33% { transform: translate(56px, 0px) translateZ(0); } 66% { transform: translate(60px, -32px) translateZ(0); } }

        .circle-animate {
          animation: var(--animation) 7s linear infinite;
        }
      `}</style>

      <button
        onClick={onClick}
        disabled={disabled}
        className={`relative rounded-[24px] border-none p-0 text-center font-semibold text-white shadow-[0_0_14px_rgba(0,175,123,0.5)] outline-none transition-all duration-300 ${disabled ? 'opacity-50 cursor-not-allowed scale-95' : 'cursor-pointer hover:scale-105 active:scale-95'}`}
        style={{
          background: 'radial-gradient(circle, #002396, #00c0b7 80%)',
          letterSpacing: '0.02em',
          lineHeight: '1.5',
        }}
      >
        {/* Inset Shadow Overlay */}
        <div className="absolute inset-0 z-[3] rounded-[24px] pointer-events-none shadow-[inset_0_3px_12px_rgba(0,140,175,0.671),inset_0_-3px_4px_rgba(157,0,209,0.8)]" />
        
        <div className="relative overflow-hidden rounded-[24px] min-w-[132px] py-3 px-6">
          <span className="relative z-10">{text}</span>
          
          {/* Animated Circles */}
          {!disabled && [
            { id: 12, x: '52px', y: '4px', bg: 'rgba(0, 44, 238, 0.7)', blur: '14px' },
            { id: 11, x: '4px', y: '4px', bg: 'rgba(0, 44, 238, 0.7)', blur: '12px' },
            { id: 10, x: '64px', y: '16px', bg: 'rgba(0, 224, 224, 0.7)', blur: '8px' },
            { id: 9, x: '20px', y: '-12px', bg: 'rgba(0, 224, 224, 0.7)', blur: '8px' },
            { id: 8, x: '28px', y: '-4px', bg: 'rgba(0, 44, 238, 0.7)', blur: '12px' },
            { id: 7, x: '8px', y: '28px', bg: 'rgba(0, 44, 238, 0.7)', blur: '12px' },
            { id: 6, x: '56px', y: '16px', bg: '#7203bd', blur: '16px' },
            { id: 5, x: '12px', y: '-4px', bg: '#7203bd', blur: '16px' },
            { id: 4, x: '80px', y: '-12px', bg: '#00023c', blur: '14px' },
            { id: 3, x: '-12px', y: '-12px', bg: '#00023c', blur: '14px' },
            { id: 2, x: '92px', y: '8px', bg: 'rgba(0, 44, 238, 0.7)', blur: '12px' },
            { id: 1, x: '0px', y: '-40px', bg: 'rgba(0, 224, 224, 0.7)', blur: '8px' },
          ].map((circle) => (
            <div
              key={circle.id}
              className="circle-animate absolute h-10 w-10 rounded-full"
              style={{
                '--animation': `circle-${circle.id}`,
                backgroundColor: circle.bg,
                filter: `blur(${circle.blur})`,
                left: 0,
                top: 0,
                transform: `translate(${circle.x}, ${circle.y}) translateZ(0)`,
              }}
            />
          ))}
        </div>
      </button>
    </>
  );
};

export default GlowButton;
