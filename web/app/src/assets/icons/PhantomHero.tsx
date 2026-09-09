import { useEffect, useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';

type Props = {
  isVisible?: boolean;
};

export default function PhantomHero({ isVisible = false }: Props) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handler = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch (error) {
      console.error('Fullscreen request failed:', error);
    }
  };

  const baseWidth = isVisible ? 'w-36 sm:w-36 md:w-44' : 'w-40 sm:w-40 md:w-44';

  return (
    <div className="relative flex flex-col items-center justify-center gap-4"> {/* skipcq: JS-0415 */}
      <style>{`
        @keyframes ghost-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-15px); }
        }
        @keyframes ghost-shadow-pulse {
          0%, 100% { transform: scale(1); opacity: 0.2; }
          50% { transform: scale(0.82); opacity: 0.1; }
        }
        @keyframes ghost-blink {
          0%, 92%, 100% { transform: scaleY(1); }
          96% { transform: scaleY(0.1); }
        }
        @keyframes ghost-mouth {
          0%, 8.62% { d: path("M 187 218 Q 200 225 213 218 Q 200 219 187 218 Z"); }
          11.21% { d: path("M 186 213 Q 200 237 214 213 Q 200 207 186 213 Z"); }
          97.41% { d: path("M 186 213 Q 200 237 214 213 Q 200 207 186 213 Z"); }
          100% { d: path("M 187 218 Q 200 225 213 218 Q 200 219 187 218 Z"); }
        }
        .ghost-float { animation: ghost-float 3.2s ease-in-out infinite; }
        .ghost-shadow { animation: ghost-shadow-pulse 3.2s ease-in-out infinite; transform-origin: 200px 385px; }
        .ghost-eyes { animation: ghost-blink 4.2s infinite; transform-origin: 200px 180px; }
        .ghost-mouth { animation: ghost-mouth 11.6s ease-in-out 2s infinite backwards; }
      `}</style>

      <div className={`relative ${baseWidth} aspect-[400/430]`}>
        <svg viewBox="0 0 400 430" className="w-full h-full" aria-hidden="true">
          <defs>
            <linearGradient
              id="ghost-body-grad"
              x1="0%"
              y1="0%"
              x2="100%"
              y2="100%"
            >
              <stop offset="0%" stopColor="#E0F7FA" />
              <stop offset="60%" stopColor="#67E8F9" />
              <stop offset="100%" stopColor="#06B6D4" />
            </linearGradient>
            <filter
              id="ghost-shadow"
              x="-20%"
              y="-20%"
              width="140%"
              height="140%"
            >
              <feDropShadow
                dx="0"
                dy="8"
                stdDeviation="6"
                floodColor="#06B6D4"
                floodOpacity="0.3"
              />
            </filter>
          </defs>
          <ellipse
            className="ghost-shadow"
            cx="200"
            cy="385"
            rx="75"
            ry="10"
            fill="#083344"
          />
          <g className="ghost-float" filter="url(#ghost-shadow)">
            <path
              d="M 80 170 C 80 103.7, 133.7 50, 200 50 C 266.3 50, 320 103.7, 320 170 L 320 330 Q 290 352, 260 330 Q 230 352, 200 330 Q 170 352, 140 330 Q 110 352, 80 330 Z"
              fill="url(#ghost-body-grad)"
            />
            <path
              d="M 285 105 C 305 140, 320 220, 320 330 Q 290 352, 260 330 Q 250 322, 245 310 C 270 270, 280 180, 285 105 Z"
              fill="#0891B2"
              opacity="0.4"
            />
            <g className="ghost-eyes">
              <ellipse cx="165" cy="180" rx="13" ry="18" fill="#083344" />
              <ellipse cx="168" cy="175" rx="5" ry="7" fill="#FFFFFF" />
              <ellipse cx="235" cy="180" rx="13" ry="18" fill="#083344" />
              <ellipse cx="238" cy="175" rx="5" ry="7" fill="#FFFFFF" />
            </g>
            <ellipse
              cx="148"
              cy="197"
              rx="9"
              ry="5"
              fill="#0891B2"
              opacity="0.6"
            />
            <ellipse
              cx="252"
              cy="197"
              rx="9"
              ry="5"
              fill="#0891B2"
              opacity="0.6"
            />
            <path
              className="ghost-mouth"
              d="M 187 218 Q 200 225 213 218 Q 200 219 187 218 Z"
              fill="#083344"
            />
          </g>
        </svg>
        <button
          type="button"
          onClick={toggleFullscreen}
          className="absolute top-5 right-14 z-20 md:hidden text-white hover:text-white/80 transition-colors"
          aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
        >
          {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
      </div>
    </div>
  );
}
