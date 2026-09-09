import { memo, useEffect, useState, useMemo } from 'react';

const LAYERS = [0, 1, 2] as const;
const LAYER_DELAYS = [0, 1100, 2200];
const LAYER_DURATIONS = [2400, 2800, 3200];
const PER_LAYER = 18;
const MIN_OPACITY = 0.25;
const STAR_COLOR = '#ffffff';

type Star = { id: string; x: number; y: number; size: number };

function makeStars(layer: number, width: number, height: number): Star[] {
  const stars: Star[] = [];
  for (let i = 0; i < PER_LAYER; i++) {
    stars.push({
      id: `${layer}-${i}`,
      x: Math.random() * width,
      y: Math.random() * height,
      size: 1.5 + Math.random() * 1.5,
    });
  }
  return stars;
}

interface TwinkleStarsProps {
  color?: string;
  className?: string;
  showBackground?: boolean;
}

function TwinkleStars({
  color = STAR_COLOR,
  className = '',
  showBackground = true,
}: TwinkleStarsProps) {
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const update = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const layers = useMemo(
    () =>
      LAYERS.map((layer) =>
        makeStars(layer, dimensions.width, dimensions.height)
      ),
    [dimensions.width, dimensions.height]
  );

  return (
    <div
      className={`fixed inset-0 overflow-hidden -z-20 ${className} ${
        showBackground ? 'bg-[#030014]' : 'bg-transparent'
      }`}
    >
      <style>{`
        @keyframes twinkle-0 {
          0%, 100% { opacity: ${MIN_OPACITY}; }
          50% { opacity: 1; }
        }
        @keyframes twinkle-1 {
          0%, 100% { opacity: ${MIN_OPACITY}; }
          50% { opacity: 1; }
        }
        @keyframes twinkle-2 {
          0%, 100% { opacity: ${MIN_OPACITY}; }
          50% { opacity: 1; }
        }
        .twinkle-layer-0 {
          animation: twinkle-0 ${LAYER_DURATIONS[0]}ms ease-in-out ${LAYER_DELAYS[0]}ms infinite;
        }
        .twinkle-layer-1 {
          animation: twinkle-1 ${LAYER_DURATIONS[1]}ms ease-in-out ${LAYER_DELAYS[1]}ms infinite;
        }
        .twinkle-layer-2 {
          animation: twinkle-2 ${LAYER_DURATIONS[2]}ms ease-in-out ${LAYER_DELAYS[2]}ms infinite;
        }
      `}</style>

      {LAYERS.map((layer) => (
        <div
          key={layer}
          className={`absolute inset-0 twinkle-layer-${layer}`}
          style={{ opacity: MIN_OPACITY }}
        >
          {layers[layer].map((star) => (
            <div
              key={star.id}
              style={{
                position: 'absolute',
                left: star.x,
                top: star.y,
                width: star.size,
                height: star.size,
                borderRadius: '50%',
                backgroundColor: color,
              }}
            />
          ))}
        </div>
      ))}

      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at center, transparent 0%, transparent 40%, rgba(3,0,20,0.8) 100%)',
        }}
      />
    </div>
  );
}

export default memo(TwinkleStars);
